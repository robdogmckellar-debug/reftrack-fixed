import { app, dialog } from 'electron';
import type { BrowserWindow, RenderProcessGoneDetails } from 'electron';

/**
 * Reliability layer for the main window. The renderer normally never dies, but
 * when Chromium terminates it (crash, OOM, GPU/renderer bug) the window is left
 * blank with no way back. This controller reloads it automatically with a short
 * backoff, and — only when a genuine crash *loop* is detected within a rolling
 * window — hands control to a recovery prompt instead of reloading forever.
 */

export interface RendererRecoveryOptions {
  /** Maximum automatic reloads inside one rolling window before prompting. */
  maxReloads?: number;
  /** A crash this long after the previous one starts a fresh incident. */
  resetAfterMs?: number;
  backoffMsFor?: (attempt: number) => number;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  reload: () => void;
  isDestroyed: () => boolean;
  onExhausted: (details: RenderProcessGoneDetails) => void;
  onReloadScheduled?: (attempt: number, delayMs: number, details: RenderProcessGoneDetails) => void;
  log?: (message: string) => void;
}

const DEFAULT_MAX_RELOADS = 3;
const DEFAULT_RESET_AFTER_MS = 60_000;

function defaultBackoff(attempt: number): number {
  // attempt is 1-based: 500ms, 1000ms, 2000ms, capped at 5s.
  return Math.min(5_000, 250 * 2 ** attempt);
}

export class RendererRecoveryController {
  private attempts = 0;
  private lastCrashAt = Number.NEGATIVE_INFINITY;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly maxReloads: number;
  private readonly resetAfterMs: number;
  private readonly backoffMsFor: (attempt: number) => number;
  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  private readonly clearTimer: (timer: ReturnType<typeof setTimeout>) => void;

  constructor(private readonly options: RendererRecoveryOptions) {
    this.maxReloads = options.maxReloads ?? DEFAULT_MAX_RELOADS;
    this.resetAfterMs = options.resetAfterMs ?? DEFAULT_RESET_AFTER_MS;
    this.backoffMsFor = options.backoffMsFor ?? defaultBackoff;
    this.now = options.now ?? (() => Date.now());
    this.setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
  }

  handleRenderProcessGone(details: RenderProcessGoneDetails): void {
    // A clean exit is normal teardown (e.g. the window closing); never reload it.
    if (details.reason === 'clean-exit') return;

    const now = this.now();
    if (now - this.lastCrashAt > this.resetAfterMs) this.attempts = 0;
    this.lastCrashAt = now;

    this.options.log?.(
      `[RefTrack] Renderer process gone (reason=${details.reason}, exitCode=${details.exitCode}).`,
    );

    if (this.attempts >= this.maxReloads) {
      this.options.onExhausted(details);
      return;
    }

    this.attempts += 1;
    const delayMs = this.backoffMsFor(this.attempts);
    this.options.onReloadScheduled?.(this.attempts, delayMs, details);

    this.pendingTimer = this.setTimer(() => {
      this.pendingTimer = null;
      if (!this.options.isDestroyed()) this.options.reload();
    }, delayMs);
  }

  /** Called after the user chooses to reload from the recovery prompt. */
  resetAttempts(): void {
    this.attempts = 0;
    this.lastCrashAt = Number.NEGATIVE_INFINITY;
  }

  dispose(): void {
    if (this.pendingTimer !== null) {
      this.clearTimer(this.pendingTimer);
      this.pendingTimer = null;
    }
  }
}

export interface InstallWindowRecoveryResult {
  dispose(): void;
}

export function installMainWindowRecovery(window: BrowserWindow): InstallWindowRecoveryResult {
  const controller = new RendererRecoveryController({
    reload: () => {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.reload();
    },
    isDestroyed: () => window.isDestroyed() || window.webContents.isDestroyed(),
    log: (message) => console.error(message),
    onExhausted: (details) => {
      void promptCrashLoop(window, details, controller);
    },
    onReloadScheduled: (attempt, delayMs) => {
      console.warn(`[RefTrack] Reloading renderer (attempt ${attempt}) in ${delayMs}ms.`);
    },
  });

  const onGone = (_event: Electron.Event, details: RenderProcessGoneDetails): void => {
    controller.handleRenderProcessGone(details);
  };
  window.webContents.on('render-process-gone', onGone);

  const onUnresponsive = (): void => {
    void promptUnresponsive(window);
  };
  window.on('unresponsive', onUnresponsive);

  window.once('closed', () => {
    controller.dispose();
  });

  return {
    dispose: () => {
      controller.dispose();
      if (!window.isDestroyed()) {
        window.webContents.off('render-process-gone', onGone);
        window.off('unresponsive', onUnresponsive);
      }
    },
  };
}

async function promptCrashLoop(
  window: BrowserWindow,
  details: RenderProcessGoneDetails,
  controller: RendererRecoveryController,
): Promise<void> {
  if (window.isDestroyed()) return;
  const choice = await dialog.showMessageBox(window, {
    type: 'error',
    title: 'RefTrack keeps crashing',
    message: 'The RefTrack window has crashed several times in a row.',
    detail: `Last reason: ${details.reason}. You can try reloading it, or quit RefTrack.`,
    buttons: ['Reload RefTrack', 'Quit'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  if (choice.response === 0) {
    controller.resetAttempts();
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.reload();
    return;
  }
  app.quit();
}

async function promptUnresponsive(window: BrowserWindow): Promise<void> {
  if (window.isDestroyed()) return;
  const choice = await dialog.showMessageBox(window, {
    type: 'warning',
    title: 'RefTrack is not responding',
    message: 'RefTrack is busy and has stopped responding.',
    detail: 'You can keep waiting for it to recover, or reload the window.',
    buttons: ['Keep waiting', 'Reload'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });

  if (choice.response === 1 && !window.isDestroyed() && !window.webContents.isDestroyed()) {
    window.webContents.reload();
  }
}
