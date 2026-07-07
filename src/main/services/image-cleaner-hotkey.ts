import { globalShortcut } from 'electron';

export type HotkeyApplyResult = { ok: true } | { ok: false; reason: 'invalid' | 'conflict' };

export interface ImageCleanerHotkeyDeps {
  onTrigger(): void;
  register?(accelerator: string, callback: () => void): boolean;
  unregister?(accelerator: string): void;
}

/**
 * Owns the single optional global shortcut that runs the image cleaner on
 * demand. Registration doubles as validation: Electron throws on a malformed
 * accelerator and returns false when the combination is already taken by
 * another application.
 */
export class ImageCleanerHotkey {
  private current: string | null = null;
  private readonly register: (accelerator: string, callback: () => void) => boolean;
  private readonly unregister: (accelerator: string) => void;

  constructor(private readonly deps: ImageCleanerHotkeyDeps) {
    this.register =
      deps.register ?? ((accelerator, callback) => globalShortcut.register(accelerator, callback));
    this.unregister = deps.unregister ?? ((accelerator) => globalShortcut.unregister(accelerator));
  }

  get accelerator(): string | null {
    return this.current;
  }

  apply(accelerator: string | null): HotkeyApplyResult {
    this.clear();
    if (accelerator === null) return { ok: true };

    let registered: boolean;
    try {
      registered = this.register(accelerator, () => this.deps.onTrigger());
    } catch {
      return { ok: false, reason: 'invalid' };
    }
    if (!registered) return { ok: false, reason: 'conflict' };

    this.current = accelerator;
    return { ok: true };
  }

  clear(): void {
    if (this.current === null) return;
    try {
      this.unregister(this.current);
    } catch {
      // Best-effort: an unregister failure still clears our tracked state.
    }
    this.current = null;
  }

  dispose(): void {
    this.clear();
  }
}
