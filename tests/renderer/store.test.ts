// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RendererSnapshot } from '../../src/shared/view-model/renderer-snapshot';
import {
  activeScreen,
  bootstrapRenderer,
  bootFailure,
  bootStatus,
  getCurrentSnapshot,
  navigateTo,
  resetRendererForRetry,
} from '../../src/renderer/app/store';

const snapshot: RendererSnapshot = {
  revision: 4,
  sites: [],
  dailyState: {},
  activity: [],
  lifetimeEarnings: 0,
  lifetimeSuccesses: 0,
  settings: {
    darkMode: true,
    folderClearEnabled: false,
    folderClearPath: null,
  },
  tasks: { categories: [] },
  tasksDailyState: {},
};

beforeEach(() => {
  resetRendererForRetry();
  activeScreen.value = 'dashboard';
});

describe('renderer Signals store', () => {
  it('bootstraps one canonical snapshot into the renderer store', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, data: { snapshot } });
    Object.defineProperty(window, 'reftrack', {
      configurable: true,
      value: { bootstrap },
    });

    await Promise.all([bootstrapRenderer(), bootstrapRenderer()]);

    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(bootStatus.value).toBe('ready');
    expect(getCurrentSnapshot()).toEqual(snapshot);
  });

  it('keeps structured bootstrap failures available to the startup screen', async () => {
    Object.defineProperty(window, 'reftrack', {
      configurable: true,
      value: {
        bootstrap: vi.fn().mockResolvedValue({
          ok: false,
          error: {
            code: 'PERSISTENCE_FAILED',
            message: 'The local state file could not be opened.',
            field: null,
            recoverable: true,
          },
        }),
      },
    });

    await bootstrapRenderer();

    expect(bootStatus.value).toBe('failed');
    expect(bootFailure.value).toEqual({
      code: 'PERSISTENCE_FAILED',
      message: 'The local state file could not be opened.',
      recoverable: true,
    });
  });

  it('updates the active screen without mutating the application snapshot', () => {
    navigateTo('statistics');

    expect(activeScreen.value).toBe('statistics');
    expect(getCurrentSnapshot()).toBeNull();
  });
});
