import type { BrowserWindow } from 'electron';

type OpenExternal = (url: string) => Promise<void>;
type Schedule = (callback: () => void, delayMs: number) => void;

const BROWSER_ACTIVATION_DELAY_MS = 250;

function refocusVisibleWindow(window: BrowserWindow): void {
  if (window.isDestroyed() || !window.isVisible()) return;
  window.focus();
}

/** Opens a URL with the default browser while keeping an active RefTrack window in front. */
export async function openExternalInBackground(
  url: string,
  window: BrowserWindow | null,
  openExternal: OpenExternal,
  schedule: Schedule = (callback, delayMs) => {
    setTimeout(callback, delayMs);
  },
): Promise<void> {
  const shouldRestoreFocus = Boolean(window && !window.isDestroyed() && window.isFocused());

  await openExternal(url);

  if (!shouldRestoreFocus || !window) return;

  refocusVisibleWindow(window);
  schedule(() => refocusVisibleWindow(window), BROWSER_ACTIVATION_DELAY_MS);
}
