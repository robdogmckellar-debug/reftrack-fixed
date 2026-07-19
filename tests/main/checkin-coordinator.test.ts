import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  session: { fromPartition: vi.fn() },
}));

import { CheckinCoordinator } from '../../src/main/checkin/checkin-coordinator';
import type { CheckinRunCompletion } from '../../src/main/checkin/checkin-coordinator';
import type { CredentialSecrets } from '../../src/main/checkin/credential-store';
import type { RunSiteCheckin } from '../../src/main/checkin/types';
import { createDefaultAppState } from '../../src/domain/defaults';
import type { AppStateV1 } from '../../src/domain/app-state';
import type { TaskSite } from '../../src/domain/entities/task-category';

function stateWith(sites: TaskSite[]): AppStateV1 {
  const state = createDefaultAppState();
  state.taskCategories = [{ id: 'cat', name: 'Category', colour: 'teal', sites }];
  return state;
}

function checkinSite(id: string, name: string): TaskSite {
  return { id, name, url: `https://${id}.example/ref`, checkin: { enabled: true } };
}

interface Harness {
  coordinator: CheckinCoordinator;
  completion: Promise<CheckinRunCompletion>;
  persisted: Array<{ date: string; taskSiteId: string; status: string }>;
  progressStages: string[];
  runSiteCheckin: ReturnType<typeof vi.fn>;
}

function createHarness(options: {
  state: AppStateV1;
  credentials: Record<string, CredentialSecrets>;
  runSiteCheckin: RunSiteCheckin;
}): Harness {
  const persisted: Harness['persisted'] = [];
  const progressStages: string[] = [];
  let resolveCompletion: (value: CheckinRunCompletion) => void;
  const completion = new Promise<CheckinRunCompletion>((resolve) => {
    resolveCompletion = resolve;
  });
  const runSiteCheckin = vi.fn(options.runSiteCheckin);

  const coordinator = new CheckinCoordinator({
    getState: () => options.state,
    getCredentials: (taskSiteId) => Promise.resolve(options.credentials[taskSiteId] ?? null),
    persistResult: (date, taskSiteId, result) => {
      persisted.push({ date, taskSiteId, status: result.status });
      return Promise.resolve();
    },
    onProgress: (event) => progressStages.push(`${event.taskSiteId}:${event.stage}`),
    onCompleted: (event) => resolveCompletion(event),
    runSiteCheckin: runSiteCheckin as unknown as RunSiteCheckin,
    now: () => new Date('2026-07-07T10:00:00.000Z'),
  });

  return { coordinator, completion, persisted, progressStages, runSiteCheckin };
}

describe('CheckinCoordinator', () => {
  it('runs every enabled site sequentially, classifying success, failure and missing credentials', async () => {
    const state = stateWith([
      checkinSite('alpha', 'Alpha'),
      checkinSite('beta', 'Beta'),
      checkinSite('gamma', 'Gamma'),
      { id: 'delta', name: 'Delta', url: 'https://delta.example/ref' },
    ]);

    const harness = createHarness({
      state,
      credentials: {
        alpha: { username: 'a', password: 'a' },
        gamma: { username: 'g', password: 'g' },
      },
      runSiteCheckin: (context) =>
        Promise.resolve(
          context.taskSiteId === 'alpha'
            ? { status: 'success', message: 'ok' }
            : { status: 'failed', message: 'no button' },
        ),
    });

    const response = harness.coordinator.start({ taskSiteId: null });
    expect(response.targetCount).toBe(3);

    const completion = await harness.completion;
    expect(completion.cancelled).toBe(false);
    expect(completion.results.map((result) => `${result.taskSiteId}:${result.status}`)).toEqual([
      'alpha:success',
      'beta:skipped',
      'gamma:failed',
    ]);

    // Beta is skipped before the runner because it has no stored credentials.
    expect(harness.runSiteCheckin).toHaveBeenCalledTimes(2);
    expect(harness.persisted).toEqual([
      { date: '2026-07-07', taskSiteId: 'alpha', status: 'success' },
      { date: '2026-07-07', taskSiteId: 'beta', status: 'skipped' },
      { date: '2026-07-07', taskSiteId: 'gamma', status: 'failed' },
    ]);
  });

  it('rejects a second run while one is in progress and clears state afterwards', async () => {
    const state = stateWith([checkinSite('alpha', 'Alpha')]);
    const harness = createHarness({
      state,
      credentials: { alpha: { username: 'a', password: 'a' } },
      runSiteCheckin: () => Promise.resolve({ status: 'success', message: 'ok' }),
    });

    const first = harness.coordinator.start({ taskSiteId: null });
    expect(() => harness.coordinator.start({ taskSiteId: null })).toThrow(/in progress/i);

    await harness.completion;

    // A fresh run is allowed once the previous one has completed.
    const second = harness.coordinator.start({ taskSiteId: null });
    expect(second.runId).not.toBe(first.runId);
  });

  it('targets only the requested site', async () => {
    const state = stateWith([checkinSite('alpha', 'Alpha'), checkinSite('beta', 'Beta')]);
    const harness = createHarness({
      state,
      credentials: {
        alpha: { username: 'a', password: 'a' },
        beta: { username: 'b', password: 'b' },
      },
      runSiteCheckin: () => Promise.resolve({ status: 'success', message: 'ok' }),
    });

    const response = harness.coordinator.start({ taskSiteId: 'beta' });
    expect(response.targetCount).toBe(1);

    const completion = await harness.completion;
    expect(completion.results).toHaveLength(1);
    expect(completion.results[0]?.taskSiteId).toBe('beta');
  });

  it('checks a shared site only once when it belongs to multiple categories', async () => {
    const shared = checkinSite('alpha', 'Alpha');
    const state = stateWith([shared]);
    state.taskCategories.push({
      id: 'cat-two',
      name: 'Second Category',
      colour: 'purple',
      sites: [{ ...shared }],
    });
    const harness = createHarness({
      state,
      credentials: { alpha: { username: 'a', password: 'a' } },
      runSiteCheckin: () => Promise.resolve({ status: 'success', message: 'ok' }),
    });

    expect(harness.coordinator.start({ taskSiteId: null }).targetCount).toBe(1);
    expect((await harness.completion).results).toHaveLength(1);
    expect(harness.runSiteCheckin).toHaveBeenCalledTimes(1);
  });

  it('throws when no site has automatic check-in enabled', () => {
    const state = stateWith([{ id: 'delta', name: 'Delta', url: 'https://delta.example/ref' }]);
    const harness = createHarness({
      state,
      credentials: {},
      runSiteCheckin: () => Promise.resolve({ status: 'success', message: 'ok' }),
    });

    expect(() => harness.coordinator.start({ taskSiteId: null })).toThrow(/enabled/i);
  });

  it('reports NOT_FOUND for a requested site that is not enabled', () => {
    const state = stateWith([{ id: 'delta', name: 'Delta', url: 'https://delta.example/ref' }]);
    const harness = createHarness({
      state,
      credentials: {},
      runSiteCheckin: () => Promise.resolve({ status: 'success', message: 'ok' }),
    });

    expect(() => harness.coordinator.start({ taskSiteId: 'delta' })).toThrow();
  });
});
