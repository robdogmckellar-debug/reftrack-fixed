import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { resolveApplicationAssetPath } from '../../src/main/application/application-asset-path';
import { APP_ENTRY_URL } from '../../src/main/application/constants';
import { isAllowedTopLevelNavigation } from '../../src/main/application/security-policy';
import {
  acquireSingleInstanceLock,
  focusMainWindow,
} from '../../src/main/application/single-instance';

describe('application asset protocol path resolution', () => {
  const rendererRoot = path.resolve('/reftrack/out/renderer');

  it('maps the application origin to files inside the renderer output only', () => {
    expect(resolveApplicationAssetPath(rendererRoot, APP_ENTRY_URL)).toBe(
      path.join(rendererRoot, 'index.html'),
    );
    expect(resolveApplicationAssetPath(rendererRoot, 'reftrack://app/assets/app.js')).toBe(
      path.join(rendererRoot, 'assets', 'app.js'),
    );
  });

  it('rejects another scheme, host, malformed encoding, and encoded traversal', () => {
    expect(resolveApplicationAssetPath(rendererRoot, 'https://app/index.html')).toBeNull();
    expect(resolveApplicationAssetPath(rendererRoot, 'reftrack://other/index.html')).toBeNull();
    expect(resolveApplicationAssetPath(rendererRoot, 'reftrack://app/%E0%A4%A')).toBeNull();
    expect(
      resolveApplicationAssetPath(rendererRoot, 'reftrack://app/%2e%2e%2f%2e%2e%2fsecret.txt'),
    ).toBeNull();
  });
});

describe('top-level navigation policy', () => {
  it('allows only the registered application host in production', () => {
    expect(isAllowedTopLevelNavigation('reftrack://app/settings', APP_ENTRY_URL)).toBe(true);
    expect(isAllowedTopLevelNavigation('reftrack://other/settings', APP_ENTRY_URL)).toBe(false);
    expect(isAllowedTopLevelNavigation('https://example.com', APP_ENTRY_URL)).toBe(false);
  });

  it('allows only the electron-vite origin during development', () => {
    const developmentUrl = 'http://127.0.0.1:5173/index.html';
    expect(isAllowedTopLevelNavigation('http://127.0.0.1:5173/assets/app.js', developmentUrl)).toBe(
      true,
    );
    expect(isAllowedTopLevelNavigation('http://localhost:5173/index.html', developmentUrl)).toBe(
      false,
    );
  });
});

describe('single-instance application behaviour', () => {
  it('does not register a second-instance listener when the lock is unavailable', () => {
    const on = vi.fn();
    const acquired = acquireSingleInstanceLock(
      {
        requestSingleInstanceLock: () => false,
        on,
      },
      () => null,
    );

    expect(acquired).toBe(false);
    expect(on).not.toHaveBeenCalled();
  });

  it('restores, shows, and focuses the existing window for a second launch', () => {
    let secondInstanceListener: (() => void) | undefined;
    const window = {
      isDestroyed: () => false,
      isMinimized: () => true,
      restore: vi.fn(),
      isVisible: () => false,
      show: vi.fn(),
      focus: vi.fn(),
    };

    const acquired = acquireSingleInstanceLock(
      {
        requestSingleInstanceLock: () => true,
        on: (_event, listener) => {
          secondInstanceListener = listener;
          return {} as never;
        },
      },
      () => window as never,
    );

    expect(acquired).toBe(true);
    secondInstanceListener?.();
    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
  });

  it('ignores an unavailable or destroyed window safely', () => {
    expect(() => focusMainWindow(null)).not.toThrow();
    expect(() => focusMainWindow({ isDestroyed: () => true } as never)).not.toThrow();
  });
});
