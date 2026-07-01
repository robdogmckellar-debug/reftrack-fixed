import path from 'node:path';

import { app, session } from 'electron';
import type { BrowserWindow } from 'electron';

import { createPerformanceBaseline } from './performance-baseline';
import { registerIpcHandlers } from './ipc/register-handlers';
import type { IpcHandlerRegistration } from './ipc/register-handlers';
import {
  registerApplicationProtocol,
  registerApplicationScheme,
} from './application/application-protocol';
import { APP_ID, MAIN_SESSION_PARTITION } from './application/constants';
import { createMainWindow } from './application/create-main-window';
import { configureMainSession } from './application/security-policy';
import { acquireSingleInstanceLock } from './application/single-instance';
import { StateService } from './services/state-service';

registerApplicationScheme();

const performanceBaseline = createPerformanceBaseline({ app });
const development = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let ipcRegistration: IpcHandlerRegistration | null = null;

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

  ipcRegistration = registerIpcHandlers({
    getMainWindow: () => mainWindow,
    stateService,
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
    ipcRegistration?.dispose();
    ipcRegistration = null;
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
