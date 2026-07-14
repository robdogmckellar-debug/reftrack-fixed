import { randomUUID } from 'node:crypto';

import type { BrowserWindow } from 'electron';

import type { AppStateV1 } from '../../domain/app-state';
import type { CheckinResultRecord } from '../../domain/entities/task-category';
import type {
  CheckinProgressEvent,
  CheckinSiteResult,
  CheckinSiteStatus,
  CheckinStartRequest,
  CheckinStartResponse,
} from '../../shared/ipc/contract';
import { deriveCheckinUrls } from '../../shared/checkin/checkin-url';
import { ApplicationError } from '../services/application-error';
import type { CredentialSecrets } from './credential-store';
import { runSiteCheckin as defaultRunSiteCheckin } from './checkin-runner';
import type { CheckinStage, RunSiteCheckin } from './types';

export interface CheckinRunCompletion {
  runId: string;
  cancelled: boolean;
  results: CheckinSiteResult[];
}

export interface CheckinCoordinatorOptions {
  getState(): AppStateV1;
  getCredentials(taskSiteId: string): Promise<CredentialSecrets | null>;
  persistResult(date: string, taskSiteId: string, result: CheckinResultRecord): Promise<void>;
  onProgress(event: CheckinProgressEvent): void;
  onCompleted(event: CheckinRunCompletion): void;
  runSiteCheckin?: RunSiteCheckin;
  now?(): Date;
}

interface CheckinTarget {
  taskSiteId: string;
  siteName: string;
  url: string;
  override: { loginPath?: string; checkinPath?: string };
}

interface ActiveRun {
  runId: string;
  abortController: AbortController;
  window: BrowserWindow | null;
  completed: boolean;
  results: CheckinSiteResult[];
}

export class CheckinCoordinator {
  private activeRun: ActiveRun | null = null;

  constructor(private readonly options: CheckinCoordinatorOptions) {}

  start(request: CheckinStartRequest): CheckinStartResponse {
    if (this.activeRun && !this.activeRun.completed) {
      throw new ApplicationError('CHECKIN_IN_PROGRESS', 'A check-in run is already in progress.', {
        recoverable: true,
      });
    }

    const targets = this.collectTargets(request.taskSiteId);
    if (targets.length === 0) {
      throw new ApplicationError(
        'CHECKIN_FAILED',
        'No Daily Tasks sites have automatic check-in enabled.',
        { recoverable: true },
      );
    }

    const run: ActiveRun = {
      runId: randomUUID(),
      abortController: new AbortController(),
      window: null,
      completed: false,
      results: [],
    };
    this.activeRun = run;
    setImmediate(() => void this.run(run, targets));
    return { runId: run.runId, targetCount: targets.length };
  }

  cancel(runId: string): boolean {
    const run = this.activeRun;
    if (!run || run.runId !== runId || run.completed) return false;
    run.abortController.abort();
    if (run.window && !run.window.isDestroyed()) run.window.destroy();
    return true;
  }

  dispose(): void {
    const run = this.activeRun;
    if (!run || run.completed) return;
    run.abortController.abort();
    if (run.window && !run.window.isDestroyed()) run.window.destroy();
    run.completed = true;
    this.activeRun = null;
  }

  private collectTargets(taskSiteId: string | null): CheckinTarget[] {
    const state = this.options.getState();
    const targets: CheckinTarget[] = [];
    const seenSiteIds = new Set<string>();

    for (const category of state.taskCategories) {
      for (const site of category.sites) {
        if (!site.checkin?.enabled) continue;
        if (taskSiteId !== null && site.id !== taskSiteId) continue;
        if (seenSiteIds.has(site.id)) continue;
        seenSiteIds.add(site.id);
        targets.push({
          taskSiteId: site.id,
          siteName: site.name,
          url: site.url,
          override: {
            ...(site.checkin.loginPath ? { loginPath: site.checkin.loginPath } : {}),
            ...(site.checkin.checkinPath ? { checkinPath: site.checkin.checkinPath } : {}),
          },
        });
      }
    }

    if (taskSiteId !== null && targets.length === 0) {
      throw new ApplicationError(
        'NOT_FOUND',
        'That site is no longer configured for auto check-in.',
        { field: 'taskSiteId', recoverable: true },
      );
    }

    return targets;
  }

  private async run(run: ActiveRun, targets: CheckinTarget[]): Promise<void> {
    const runSiteCheckin = this.options.runSiteCheckin ?? defaultRunSiteCheckin;
    const date = localDateKey(this.now());

    try {
      for (let index = 0; index < targets.length; index += 1) {
        this.ensureCurrent(run);
        const target = targets[index];
        if (!target) continue;

        const position = index + 1;
        const settings = this.options.getState().settings.checkin;
        const urls = deriveCheckinUrls(target.url, settings, target.override);

        if (!urls) {
          await this.record(run, target, position, targets.length, date, {
            status: 'failed',
            message: 'The site URL is missing or is not a valid HTTPS URL.',
          });
          continue;
        }

        const credentials = await this.options.getCredentials(target.taskSiteId);
        if (!credentials) {
          await this.record(run, target, position, targets.length, date, {
            status: 'skipped',
            message: 'No saved credentials for this site.',
          });
          continue;
        }

        this.emitProgress(
          run,
          target,
          position,
          targets.length,
          'starting',
          null,
          `Starting ${target.siteName}…`,
        );

        let outcome: { status: CheckinSiteStatus; message: string };
        try {
          outcome = await runSiteCheckin({
            runId: run.runId,
            taskSiteId: target.taskSiteId,
            siteName: target.siteName,
            loginUrl: urls.loginUrl,
            checkinUrl: urls.checkinUrl,
            hostname: urls.hostname,
            credentials,
            selectors: {
              usernameSelector: settings.usernameSelector,
              passwordSelector: settings.passwordSelector,
              submitSelector: settings.submitSelector,
              checkinButtonSelector: settings.checkinButtonSelector,
              dismissSelector: settings.dismissSelector,
              successSelector: settings.successSelector,
            },
            signal: run.abortController.signal,
            reportStage: (stage: CheckinStage, message: string) =>
              this.emitProgress(run, target, position, targets.length, stage, null, message),
            onWindowCreated: (window) => {
              run.window = window;
            },
          });
        } catch (error: unknown) {
          if (run.abortController.signal.aborted) throw cancelledError();
          outcome = { status: 'failed', message: normaliseMessage(error) };
        } finally {
          run.window = null;
        }

        await this.record(run, target, position, targets.length, date, outcome);
      }

      this.complete(run, false);
    } catch (error: unknown) {
      if (run.completed) return;
      const cancelled = run.abortController.signal.aborted || isCancelledError(error);
      this.complete(run, cancelled);
    } finally {
      if (run.window && !run.window.isDestroyed()) run.window.destroy();
      run.window = null;
    }
  }

  private async record(
    run: ActiveRun,
    target: CheckinTarget,
    position: number,
    total: number,
    date: string,
    outcome: { status: CheckinSiteStatus; message: string },
  ): Promise<void> {
    const record: CheckinResultRecord = {
      status: outcome.status,
      at: this.now().toISOString(),
      ...(outcome.message ? { message: outcome.message } : {}),
    };
    try {
      await this.options.persistResult(date, target.taskSiteId, record);
    } catch {
      // Persisting a single result must not abort the whole run.
    }
    run.results.push({
      taskSiteId: target.taskSiteId,
      siteName: target.siteName,
      status: outcome.status,
      message: outcome.message,
    });
    this.emitProgress(
      run,
      target,
      position,
      total,
      'site-complete',
      outcome.status,
      outcome.message,
    );
  }

  private emitProgress(
    run: ActiveRun,
    target: CheckinTarget,
    index: number,
    total: number,
    stage: CheckinProgressEvent['stage'],
    status: CheckinSiteStatus | null,
    message: string,
  ): void {
    if (run.completed || this.activeRun !== run) return;
    this.options.onProgress({
      runId: run.runId,
      taskSiteId: target.taskSiteId,
      siteName: target.siteName,
      index,
      total,
      stage,
      status,
      message,
    });
  }

  private complete(run: ActiveRun, cancelled: boolean): void {
    if (run.completed) return;
    run.completed = true;
    if (this.activeRun === run) this.activeRun = null;
    this.options.onCompleted({ runId: run.runId, cancelled, results: run.results });
  }

  private ensureCurrent(run: ActiveRun): void {
    if (run.abortController.signal.aborted || run.completed) throw cancelledError();
  }

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }
}

function localDateKey(date: Date): string {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function cancelledError(): ApplicationError {
  return new ApplicationError('CHECKIN_CANCELLED', 'The check-in run was cancelled.', {
    recoverable: true,
  });
}

function isCancelledError(error: unknown): boolean {
  return error instanceof ApplicationError && error.code === 'CHECKIN_CANCELLED';
}

function normaliseMessage(error: unknown): string {
  if (error instanceof ApplicationError) return error.message;
  return 'The check-in could not be completed for this site.';
}
