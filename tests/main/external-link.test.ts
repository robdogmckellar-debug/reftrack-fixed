import type { BrowserWindow } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import { openExternalInBackground } from '../../src/main/application/external-link';

function windowStub(overrides: Partial<BrowserWindow> = {}): BrowserWindow {
  return {
    isDestroyed: () => false,
    isFocused: () => true,
    isVisible: () => true,
    focus: vi.fn(),
    ...overrides,
  } as BrowserWindow;
}

describe('background external links', () => {
  it('opens the URL and reclaims focus after the browser activates', async () => {
    const window = windowStub();
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const scheduled: Array<() => void> = [];

    await openExternalInBackground('https://example.com/', window, openExternal, (callback) => {
      scheduled.push(callback);
    });

    expect(openExternal).toHaveBeenCalledWith('https://example.com/');
    expect(window.focus).toHaveBeenCalledOnce();
    expect(scheduled).toHaveLength(1);

    scheduled[0]?.();
    expect(window.focus).toHaveBeenCalledTimes(2);
  });

  it('does not steal focus when RefTrack was not active', async () => {
    const window = windowStub({ isFocused: () => false });
    const schedule = vi.fn();

    await openExternalInBackground('https://example.com/', window, vi.fn(), schedule);

    expect(window.focus).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it('does not refocus a window destroyed during browser startup', async () => {
    let destroyed = false;
    const window = windowStub({ isDestroyed: () => destroyed });
    const scheduled: Array<() => void> = [];

    await openExternalInBackground('https://example.com/', window, vi.fn(), (callback) => {
      scheduled.push(callback);
    });

    destroyed = true;
    scheduled[0]?.();
    expect(window.focus).toHaveBeenCalledOnce();
  });
});
