import path from 'node:path';

import { app, globalShortcut, session } from 'electron';
import type { BrowserWindow, Tray } from 'electron';

import { createPerformanceBaseline } from './performance-baseline';
import { registerIpcHandlers } from './ipc/register-handlers';
import type { IpcHandlerRegistration } from './ipc/register-handlers';
import {
  registerApplicationProtocol,
  registerApplicationScheme,
} from './application/application-protocol';
import { APP_ID, MAIN_SESSION_PARTITION } from './application/constants';
import { createApplicationTray } from './application/application-tray';
import { createMainWindow } from './application/create-main-window';
import { configureMainSession } from './application/security-policy';
import { acquireSingleInstanceLock } from './application/single-instance';
import { HotkeyService } from './services/hotkey-service';
import { StateService } from './services/state-service';

registerApplicationScheme();

const performanceBaseline = createPerformanceBaseline({ app });
const development = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let applicationTray: Tray | null = null;
let ipcRegistration: IpcHandlerRegistration | null = null;
let hotkeyService: HotkeyService | null = null;

async function startApplication(): Promise<void> {
  performanceBaseline.mark('appReadyMs');
  app.setAppUserModelId(APP_ID);

  const mainSession = session.fromPartition(MAIN_SESSION_PARTITION, { cache: true });
  configureMainSession(mainSession, development);
  registerApplicationProtocol(mainSession, path.join(__dirname, '../renderer'));

  const { service: stateService, initialisation } = await StateService.create({
    filePath: path.join(app.getPath('userData'), 'reftrack-state-v1.json'),
  });
  if (initialisation.recovered) {
    console.warn(
      `[RefTrack] State recovered from ${initialisation.source} at revision ${initialisation.revision}.`,
    );
  }

  hotkeyService = new HotkeyService({
    globalShortcut: {
      register: (accelerator, callback) => globalShortcut.register(accelerator, callback),
      unregister: (accelerator) => globalShortcut.unregister(accelerator),
    },
    getMainWindow: () => mainWindow,
  });

  ipcRegistration = registerIpcHandlers({
    getMainWindow: () => mainWindow,
    stateService,
    hotkeyService,
    development,
    importerWorkerPath: path.join(__dirname, 'importer-worker.js'),
    ...(process.env.ELECTRON_RENDERER_URL
      ? { developmentRendererUrl: process.env.ELECTRON_RENDERER_URL }
      : {}),
  });

  mainWindow = await createMainWindow({
    session: mainSession,
    development,
    developmentRendererUrl: process.env.ELECTRON_RENDERER_URL,
    performanceBaseline,
    onCreated: (window) => {
      mainWindow = window;
    },
  });

  mainWindow.once('closed', () => {
    mainWindow = null;
  });

  applicationTray = createApplicationTray(() => mainWindow);
  ipcRegistration.startBackgroundServices();

  hotkeyService.sync(stateService.getSnapshot());
  hotkeyService.registerShareQueueAdvanceHotkey();
}

if (!acquireSingleInstanceLock(app, () => mainWindow)) {
  app.quit();
} else {
  app
    .whenReady()
    .then(startApplication)
    .catch((error: unknown) => {
      console.error('[RefTrack] Application startup failed:', error);
      app.quit();
    });

  app.on('before-quit', () => {
    applicationTray?.destroy();
    applicationTray = null;
    ipcRegistration?.dispose();
    ipcRegistration = null;
    hotkeyService?.dispose();
    hotkeyService = null;
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
