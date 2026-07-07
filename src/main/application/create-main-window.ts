import path from 'node:path';

import { app, BrowserWindow } from 'electron';
import type { Session } from 'electron';

import type { PerformanceBaseline } from '../performance-baseline';
import { APP_ENTRY_URL } from './constants';
import { hardenMainWebContents } from './security-policy';
import { installMainWindowRecovery } from './window-recovery';

interface CreateMainWindowOptions {
  session: Session;
  development: boolean;
  developmentRendererUrl: string | undefined;
  performanceBaseline: PerformanceBaseline;
  onCreated?: (window: BrowserWindow) => void;
}

function rendererUrlFor(options: CreateMainWindowOptions): string {
  if (options.development && options.developmentRendererUrl) {
    const url = new URL(options.developmentRendererUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`Unsupported development renderer protocol: ${url.protocol}`);
    }
    return url.href;
  }

  return APP_ENTRY_URL;
}

export async function createMainWindow(options: CreateMainWindowOptions): Promise<BrowserWindow> {
  options.performanceBaseline.mark('createWindowStartedMs');

  const rendererUrl = rendererUrlFor(options);
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b1018',
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0b1018',
      symbolColor: '#b6c2d0',
      height: 48,
    },
    icon: path.join(app.getAppPath(), 'assets', 'icon.png'),
    webPreferences: {
      session: options.session,
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      safeDialogs: true,
      spellcheck: false,
      devTools: options.development,
    },
  });

  options.onCreated?.(window);

  window.removeMenu();
  hardenMainWebContents(window.webContents, rendererUrl);
  installMainWindowRecovery(window);
  options.performanceBaseline.attachToWindow(window);

  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) window.show();
  });

  await window.loadURL(rendererUrl);

  if (options.development && process.env.REFTRACK_OPEN_DEVTOOLS === '1') {
    window.webContents.openDevTools({ mode: 'detach' });
  }

  return window;
}
