import { describe, expect, it, vi } from 'vitest';

import { createDefaultAppState } from '../../src/domain/defaults';
import { HotkeyService } from '../../src/main/services/hotkey-service';
import { IPC_CHANNELS } from '../../src/shared/ipc/channels';

function createWindow() {
  return {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => false,
      send: vi.fn(),
    },
  };
}

describe('HotkeyService', () => {
  it('dispatches and unregisters the Facebook Group Shares advance shortcut', () => {
    const callbacks = new Map<string, () => void>();
    const unregister = vi.fn();
    const window = createWindow();
    const service = new HotkeyService({
      globalShortcut: {
        register: vi.fn((accelerator: string, callback: () => void) => {
          callbacks.set(accelerator, callback);
          return true;
        }),
        unregister,
      },
      getMainWindow: () => window as never,
    });

    expect(service.registerShareQueueAdvanceHotkey()).toBe(true);

    callbacks.get('CommandOrControl+Alt+N')?.();
    expect(window.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.shareQueueAdvanceTriggered, {
      accelerator: 'CommandOrControl+Alt+N',
    });

    service.dispose();
    expect(unregister).toHaveBeenCalledWith('CommandOrControl+Alt+N');
  });

  it('registers copy shortcuts only for active sites', () => {
    const state = createDefaultAppState();
    state.sites = [
      { ...state.sites[0]!, id: 'active', lifecycle: 'active' },
      { ...state.sites[1]!, id: 'archived', lifecycle: 'archived' },
      { ...state.sites[2]!, id: 'trashed', lifecycle: 'trashed' },
    ];
    state.settings.hotkeys = {
      enabled: true,
      bindings: [
        { siteId: 'active', key: 'F4' },
        { siteId: 'archived', key: 'F5' },
        { siteId: 'trashed', key: 'F6' },
      ],
    };

    const register = vi.fn(() => true);
    const service = new HotkeyService({
      globalShortcut: {
        register,
        unregister: vi.fn(),
      },
      getMainWindow: () => createWindow() as never,
    });

    service.sync(state);

    expect(register).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith('F4', expect.any(Function));
  });
});
