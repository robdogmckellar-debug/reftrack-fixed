import { randomUUID } from 'node:crypto';

import { utilityProcess } from 'electron';
import type { BrowserWindow, UtilityProcess } from 'electron';

import type {
  ImporterCompletedEvent,
  ImporterProgressEvent,
  ImporterStartResponse,
} from '../../shared/ipc/contract';
import { isIpcErrorCode, type IpcErrorCode } from '../../shared/ipc/error-codes';
import { ApplicationError } from '../services/application-error';
import { runBrowserFallback } from './browser-fallback';
import { validateImporterUrl } from './network-policy';
import { toImporterResult } from './types';
import type { BrowserImportResult, StaticImportResult } from './types';
import { WorkerToMainMessageSchema } from './worker-protocol';

interface ImportCoordinatorOptions {
  workerPath: string;
  onProgress(event: ImporterProgressEvent): void;
  onCompleted(event: ImporterCompletedEvent): void;
  forkWorker?: (workerPath: string) => UtilityProcess;
  browserFallback?: typeof runBrowserFallback;
}

interface ActiveJob {
  jobId: string;
  url: string;
  abortController: AbortController;
  utility: UtilityProcess | null;
  browserWindow: BrowserWindow | null;
  completed: boolean;
}

const WORKER_TIMEOUT_MS = 25_000;

export class ImportCoordinator {
  private activeJob: ActiveJob | null = null;

  constructor(private readonly options: ImportCoordinatorOptions) {}

  start(rawUrl: string): ImporterStartResponse {
    if (this.activeJob && !this.activeJob.completed) {
      throw new ApplicationError(
        'IMPORT_IN_PROGRESS',
        'Another partner-page import is already running.',
        { recoverable: true },
      );
    }

    const url = validateImporterUrl(rawUrl).href;
    const job: ActiveJob = {
      jobId: randomUUID(),
      url,
      abortController: new AbortController(),
      utility: null,
      browserWindow: null,
      completed: false,
    };
    this.activeJob = job;
    setImmediate(() => void this.run(job));
    return { jobId: job.jobId };
  }

  cancel(jobId: string): boolean {
    const job = this.activeJob;
    if (!job || job.jobId !== jobId || job.completed) return false;

    job.abortController.abort();
    job.utility?.kill();
    if (job.browserWindow && !job.browserWindow.isDestroyed()) job.browserWindow.destroy();
    this.completeFailure(job, cancelledError());
    return true;
  }

  dispose(): void {
    const job = this.activeJob;
    if (!job || job.completed) return;
    job.abortController.abort();
    job.utility?.kill();
    if (job.browserWindow && !job.browserWindow.isDestroyed()) job.browserWindow.destroy();
    job.completed = true;
    this.activeJob = null;
  }

  private async run(job: ActiveJob): Promise<void> {
    try {
      const staticResult: StaticImportResult = await this.runStaticWorker(job);
      ensureCurrent(job);

      let browserResult: BrowserImportResult | undefined;
      if (staticResult.requiresBrowserFallback) {
        const browserFallback = this.options.browserFallback ?? runBrowserFallback;
        browserResult = await browserFallback({
          jobId: job.jobId,
          sourceUrl: staticResult.sourceUrl,
          finalUrl: staticResult.finalUrl,
          signal: job.abortController.signal,
          reportProgress: (progress) => this.progress(job, progress),
          onWindowCreated: (window) => {
            job.browserWindow = window;
          },
        });
        job.browserWindow = null;
        ensureCurrent(job);
      }

      this.progress(job, {
        stage: 'finalising',
        message: 'Filtering duplicates and preparing the review list…',
        percent: 98,
      });
      const result = toImporterResult(staticResult, browserResult);
      if (result.sites.length === 0) {
        throw new ApplicationError(
          'IMPORT_UNSUPPORTED_PAGE',
          'No usable external partner links were found on this page.',
          { field: 'url', recoverable: true },
        );
      }

      this.completeSuccess(job, result);
    } catch (error: unknown) {
      if (job.completed) return;
      this.completeFailure(job, normaliseError(error));
    } finally {
      job.utility?.kill();
      job.utility = null;
      if (job.browserWindow && !job.browserWindow.isDestroyed()) job.browserWindow.destroy();
      job.browserWindow = null;
    }
  }

  private runStaticWorker(job: ActiveJob): Promise<StaticImportResult> {
    return new Promise<StaticImportResult>((resolve, reject) => {
      const child = this.options.forkWorker
        ? this.options.forkWorker(this.options.workerPath)
        : utilityProcess.fork(this.options.workerPath, [], {
            serviceName: 'RefTrack Partner Importer',
            stdio: 'ignore',
          });
      job.utility = child;
      let settled = false;

      const finish = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        child.removeAllListeners();
        job.utility = null;
        callback();
      };

      const timeout = setTimeout(() => {
        child.kill();
        finish(() =>
          reject(
            new ApplicationError('IMPORT_TIMEOUT', 'The static importer timed out.', {
              recoverable: true,
            }),
          ),
        );
      }, WORKER_TIMEOUT_MS);

      child.on('spawn', () => {
        child.postMessage({ type: 'start', jobId: job.jobId, url: job.url });
      });
      child.on('message', (rawMessage: unknown) => {
        const parsed = WorkerToMainMessageSchema.safeParse(rawMessage);
        if (!parsed.success || parsed.data.jobId !== job.jobId) return;
        const message = parsed.data;
        if (message.type === 'progress') {
          this.progress(job, {
            stage: message.stage,
            message: message.message,
            percent: message.percent,
          });
          return;
        }
        if (message.type === 'result') {
          finish(() => resolve(message.result));
          child.kill();
          return;
        }
        finish(() =>
          reject(
            new ApplicationError(normaliseErrorCode(message.error.code), message.error.message, {
              recoverable: message.error.recoverable,
            }),
          ),
        );
        child.kill();
      });
      child.on('error', (_type, location) => {
        finish(() =>
          reject(
            new ApplicationError(
              'IMPORT_FAILED',
              `The isolated importer process failed${location ? ` at ${location}` : ''}.`,
              { recoverable: true },
            ),
          ),
        );
      });
      child.on('exit', (code) => {
        if (settled || job.abortController.signal.aborted) return;
        finish(() =>
          reject(
            new ApplicationError(
              'IMPORT_FAILED',
              `The isolated importer process exited unexpectedly${code ? ` (code ${code})` : ''}.`,
              { recoverable: true },
            ),
          ),
        );
      });
    });
  }

  private progress(job: ActiveJob, progress: Omit<ImporterProgressEvent, 'jobId'>): void {
    if (job.completed || this.activeJob !== job) return;
    this.options.onProgress({ jobId: job.jobId, ...progress });
  }

  private completeSuccess(
    job: ActiveJob,
    result: Extract<ImporterCompletedEvent, { ok: true }>['result'],
  ): void {
    if (job.completed) return;
    job.completed = true;
    if (this.activeJob === job) this.activeJob = null;
    this.options.onCompleted({ jobId: job.jobId, ok: true, result });
  }

  private completeFailure(job: ActiveJob, error: ApplicationError): void {
    if (job.completed) return;
    job.completed = true;
    if (this.activeJob === job) this.activeJob = null;
    this.options.onCompleted({
      jobId: job.jobId,
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        recoverable: error.options.recoverable ?? false,
      },
    });
  }
}

function ensureCurrent(job: ActiveJob): void {
  if (job.abortController.signal.aborted || job.completed) throw cancelledError();
}

function cancelledError(): ApplicationError {
  return new ApplicationError('IMPORT_CANCELLED', 'The import was cancelled.', {
    recoverable: true,
  });
}

function normaliseError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) return error;
  return new ApplicationError('IMPORT_FAILED', 'The partner page could not be imported.', {
    recoverable: true,
    cause: error,
  });
}

function normaliseErrorCode(value: string): IpcErrorCode {
  return isIpcErrorCode(value) ? value : 'IMPORT_FAILED';
}
