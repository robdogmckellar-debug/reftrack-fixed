import type { App, BrowserWindow } from 'electron';

interface SingleInstanceApp {
  requestSingleInstanceLock(): boolean;
  on(event: 'second-instance', listener: () => void): App;
}

export function focusMainWindow(window: BrowserWindow | null): void {
  if (!window || window.isDestroyed()) return;

  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
}

export function acquireSingleInstanceLock(
  app: SingleInstanceApp,
  getMainWindow: () => BrowserWindow | null,
): boolean {
  if (!app.requestSingleInstanceLock()) return false;

  app.on('second-instance', () => {
    focusMainWindow(getMainWindow());
  });

  return true;
}
