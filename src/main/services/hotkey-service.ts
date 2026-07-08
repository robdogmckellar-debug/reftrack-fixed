import type { BrowserWindow } from 'electron';

import type { AppStateV1 } from '../../domain/app-state';
import { resolveHotkeyBindings } from '../../shared/hotkeys/bindings';
import { IPC_CHANNELS } from '../../shared/ipc/channels';

export interface GlobalShortcutPort {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}

export interface HotkeyServiceOptions {
  globalShortcut: GlobalShortcutPort;
  getMainWindow(): BrowserWindow | null;
}

/**
 * Registers OS-wide shortcuts so a site's copy action can be triggered even
 * when the RefTrack window is minimised or unfocused. The effective key for
 * each site is derived from persisted settings via {@link resolveHotkeyBindings}.
 */
export class HotkeyService {
  private readonly registeredKeys = new Set<string>();

  constructor(private readonly options: HotkeyServiceOptions) {}

  sync(state: AppStateV1): void {
    this.unregisterAll();
    if (!state.settings.hotkeys.enabled) return;

    const orderedSiteIds = state.sites.map((site) => site.id);
    const bindings = resolveHotkeyBindings(orderedSiteIds, state.settings.hotkeys);

    for (const [siteId, key] of bindings) {
      try {
        const registered = this.options.globalShortcut.register(key, () => this.dispatch(siteId));
        if (registered) this.registeredKeys.add(key);
      } catch (error: unknown) {
        console.warn(`[RefTrack] Could not register hotkey "${key}":`, error);
      }
    }
  }

  unregisterAll(): void {
    for (const key of this.registeredKeys) {
      try {
        this.options.globalShortcut.unregister(key);
      } catch {
        // Ignore: the shortcut may already be gone (e.g. during shutdown).
      }
    }
    this.registeredKeys.clear();
  }

  dispose(): void {
    this.unregisterAll();
  }

  private dispatch(siteId: string): void {
    const window = this.options.getMainWindow();
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return;
    window.webContents.send(IPC_CHANNELS.hotkeyTriggered, { siteId });
  }
}
