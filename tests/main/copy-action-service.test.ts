import { describe, expect, it, vi } from 'vitest';

import type { RendererSnapshot } from '../../src/shared/view-model/renderer-snapshot';
import { CopyActionService } from '../../src/main/services/copy-action-service';
import { ApplicationError } from '../../src/main/services/application-error';

const request = {
  siteId: 'site-a',
  text: 'https://example.com/ref 01/07 10:30',
  occurredAt: '2026-07-01T00:30:00.000Z',
};

describe('copy action orchestration', () => {
  it('copies, commits once, and starts configured image cleanup', async () => {
    const writeClipboard = vi.fn();
    const start = vi.fn(() => ({ status: 'started' as const, jobId: 'cleanup-1' }));
    const recordCopy = vi.fn(async () => ({
      snapshot: snapshotWithCleaner(true, 'C:\\Screenshots\\RefTrack'),
    }));
    const service = new CopyActionService({
      commands: {
        assertCopyAllowed: vi.fn(),
        recordCopy,
      },
      cleanupCoordinator: { start },
      writeClipboard,
    });

    const response = await service.copy(request);

    expect(writeClipboard).toHaveBeenCalledWith(request.text);
    expect(recordCopy).toHaveBeenCalledWith(request.siteId, request.occurredAt);
    expect(start).toHaveBeenCalledWith('C:\\Screenshots\\RefTrack');
    expect(response.cleanup).toEqual({ status: 'started', jobId: 'cleanup-1' });
  });

  it('does not start cleanup when disabled or when no folder is configured', async () => {
    const start = vi.fn();
    const disabled = new CopyActionService({
      commands: {
        assertCopyAllowed: vi.fn(),
        recordCopy: vi.fn(async () => ({ snapshot: snapshotWithCleaner(false, null) })),
      },
      cleanupCoordinator: { start },
      writeClipboard: vi.fn(),
    });
    await expect(disabled.copy(request)).resolves.toMatchObject({
      cleanup: { status: 'disabled', jobId: null },
    });

    const unconfigured = new CopyActionService({
      commands: {
        assertCopyAllowed: vi.fn(),
        recordCopy: vi.fn(async () => ({ snapshot: snapshotWithCleaner(true, null) })),
      },
      cleanupCoordinator: { start },
      writeClipboard: vi.fn(),
    });
    await expect(unconfigured.copy(request)).resolves.toMatchObject({
      cleanup: { status: 'not-configured', jobId: null },
    });
    expect(start).not.toHaveBeenCalled();
  });

  it('locks a site before clipboard work and rejects a duplicate in-flight copy', async () => {
    let finishRecord: ((value: { snapshot: RendererSnapshot }) => void) | undefined;
    const recordGate = new Promise<{ snapshot: RendererSnapshot }>((resolve) => {
      finishRecord = resolve;
    });
    const writeClipboard = vi.fn();
    const service = new CopyActionService({
      commands: {
        assertCopyAllowed: vi.fn(),
        recordCopy: vi.fn(() => recordGate),
      },
      cleanupCoordinator: { start: vi.fn(() => ({ status: 'disabled', jobId: null })) },
      writeClipboard,
    });

    const first = service.copy(request);
    await expect(service.copy(request)).rejects.toMatchObject({
      code: 'ACTION_IN_PROGRESS',
    } satisfies Partial<ApplicationError>);
    expect(writeClipboard).toHaveBeenCalledOnce();

    finishRecord?.({ snapshot: snapshotWithCleaner(false, null) });
    await expect(first).resolves.toMatchObject({ cleanup: { status: 'disabled' } });
  });

  it('does not touch the clipboard when the daily limit preflight fails', async () => {
    const writeClipboard = vi.fn();
    const recordCopy = vi.fn();
    const service = new CopyActionService({
      commands: {
        assertCopyAllowed: () => {
          throw new ApplicationError('DAILY_LIMIT_REACHED', 'Done today', { recoverable: true });
        },
        recordCopy,
      },
      cleanupCoordinator: { start: vi.fn(() => ({ status: 'disabled', jobId: null })) },
      writeClipboard,
    });

    await expect(service.copy(request)).rejects.toMatchObject({ code: 'DAILY_LIMIT_REACHED' });
    expect(writeClipboard).not.toHaveBeenCalled();
    expect(recordCopy).not.toHaveBeenCalled();
  });
});

function snapshotWithCleaner(enabled: boolean, folderPath: string | null): RendererSnapshot {
  return {
    revision: 1,
    sites: [],
    dailyState: {},
    activity: [],
    lifetimeEarnings: 0,
    lifetimeSuccesses: 0,
    settings: {
      darkMode: true,
      folderClearEnabled: enabled,
      folderClearPath: folderPath,
    },
    tasks: { categories: [] },
    tasksDailyState: {},
  };
}
