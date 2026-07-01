import { EventEmitter } from 'node:events';

import type { UtilityProcess } from 'electron';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  utilityProcess: { fork: vi.fn() },
  BrowserWindow: class {},
  session: { fromPartition: vi.fn() },
}));

import { ImportCoordinator } from '../../src/main/importer/import-coordinator';
import type { ImporterCompletedEvent, ImporterProgressEvent } from '../../src/shared/ipc/contract';

class FakeUtilityProcess extends EventEmitter {
  readonly kill = vi.fn(() => true);
  readonly postMessage = vi.fn();
}

describe('ImportCoordinator', () => {
  it('allows only one job, forwards genuine progress, and completes a static import', async () => {
    const child = new FakeUtilityProcess();
    const progress: ImporterProgressEvent[] = [];
    const completed: ImporterCompletedEvent[] = [];
    const coordinator = new ImportCoordinator({
      workerPath: 'importer-worker.js',
      forkWorker: () => child as unknown as UtilityProcess,
      onProgress: (event) => progress.push(event),
      onCompleted: (event) => completed.push(event),
    });

    const { jobId } = coordinator.start('https://example.com/partners');
    expect(() => coordinator.start('https://example.com/other')).toThrow(/already running/i);
    await nextTurn();

    child.emit('spawn');
    expect(child.postMessage).toHaveBeenCalledWith({
      type: 'start',
      jobId,
      url: 'https://example.com/partners',
    });

    child.emit('message', {
      type: 'progress',
      jobId,
      stage: 'downloading',
      message: 'Downloading the HTML page…',
      percent: 40,
    });
    child.emit('message', {
      type: 'result',
      jobId,
      result: {
        brandName: 'Example',
        sites: [{ name: 'Alpha', url: 'https://alpha.example.org/RF1' }],
        confidence: 0.9,
        warnings: [],
        sourceUrl: 'https://example.com/partners',
        finalUrl: 'https://example.com/partners',
        redirectCount: 0,
        requiresBrowserFallback: false,
      },
    });
    await nextTurn();

    expect(progress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ jobId, stage: 'downloading', percent: 40 }),
        expect.objectContaining({ jobId, stage: 'finalising', percent: 98 }),
      ]),
    );
    expect(completed).toEqual([
      expect.objectContaining({
        jobId,
        ok: true,
        result: expect.objectContaining({ method: 'static', brandName: 'Example' }),
      }),
    ]);
  });

  it('cancels the active utility process and emits one cancellation result', async () => {
    const child = new FakeUtilityProcess();
    const completed: ImporterCompletedEvent[] = [];
    const coordinator = new ImportCoordinator({
      workerPath: 'importer-worker.js',
      forkWorker: () => child as unknown as UtilityProcess,
      onProgress: () => undefined,
      onCompleted: (event) => completed.push(event),
    });

    const { jobId } = coordinator.start('https://example.com/partners');
    await nextTurn();
    expect(coordinator.cancel(jobId)).toBe(true);
    expect(child.kill).toHaveBeenCalled();
    expect(coordinator.cancel(jobId)).toBe(false);
    expect(completed).toEqual([
      {
        jobId,
        ok: false,
        error: {
          code: 'IMPORT_CANCELLED',
          message: 'The import was cancelled.',
          recoverable: true,
        },
      },
    ]);
  });
});

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}
