import path from 'node:path';

import { app, clipboard, dialog, ipcMain, Notification, safeStorage, shell } from 'electron';
import type { BrowserWindow, IpcMainInvokeEvent, OpenDialogOptions } from 'electron';
import { z } from 'zod';

import { centsToDollars } from '../../domain/money/money';
import { IPC_CHANNELS } from '../../shared/ipc/channels';
import type { ApplicationInfo, SelectImageCleanerFolderResponse } from '../../shared/ipc/contract';
import type { IpcFailure, IpcResult } from '../../shared/ipc/result';
import {
  ActionNotificationRequestSchema,
  CheckinCancelRequestSchema,
  CheckinDeleteCredentialsRequestSchema,
  CheckinSaveCredentialsRequestSchema,
  CheckinStartRequestSchema,
  CopyLinkRequestSchema,
  EmptyRequestSchema,
  ImporterCancelRequestSchema,
  ImporterStartRequestSchema,
  OpenExternalRequestSchema,
  RecordSuccessRequestSchema,
  SetHotkeysRequestSchema,
  SetImageCleanerEnabledRequestSchema,
  SiteDeleteRequestSchema,
  SiteUpsertRequestSchema,
  TaskCategoryDeleteRequestSchema,
  TaskCategoryUpsertRequestSchema,
  TaskCompletionRequestSchema,
  TaskCompletionsRequestSchema,
  UndoSuccessRequestSchema,
} from '../../shared/ipc/schemas';
import { CheckinCoordinator } from '../checkin/checkin-coordinator';
import { CheckinScheduler } from '../checkin/checkin-scheduler';
import { CredentialStore } from '../checkin/credential-store';
import type { CredentialCrypto } from '../checkin/credential-store';
import { ImportCoordinator } from '../importer/import-coordinator';
import { ApplicationCommandService } from '../services/application-command-service';
import { CopyActionService } from '../services/copy-action-service';
import { ApplicationError } from '../services/application-error';
import type { HotkeyService } from '../services/hotkey-service';
import { ImageCleanerService, ImageCleanupCoordinator } from '../services/image-cleaner-service';
import type { StateService } from '../services/state-service';
import { assertTrustedIpcSender } from './validate-sender';
import { validateExternalUrl } from './url-policy';

const credentialCrypto: CredentialCrypto = {
  isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
  encryptString: (plainText) => safeStorage.encryptString(plainText),
  decryptString: (encrypted) => safeStorage.decryptString(encrypted),
};

export interface RegisterIpcHandlersOptions {
  getMainWindow(): BrowserWindow | null;
  stateService: StateService;
  hotkeyService: HotkeyService;
  development: boolean;
  developmentRendererUrl?: string;
  importerWorkerPath: string;
}

export interface IpcHandlerRegistration {
  dispose(): void;
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): IpcHandlerRegistration {
  const commands = new ApplicationCommandService(options.stateService);
  const imageCleaner = new ImageCleanerService({
    trashItem: (filePath) => shell.trashItem(filePath),
  });
  const cleanupCoordinator = new ImageCleanupCoordinator({
    cleaner: imageCleaner,
    onCompleted: (event) => {
      const window = options.getMainWindow();
      if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return;
      window.webContents.send(IPC_CHANNELS.imageCleanerCompleted, event);
    },
  });
  const copyActions = new CopyActionService({
    commands,
    cleanupCoordinator,
    writeClipboard: (text) => clipboard.writeText(text),
  });
  const importer = new ImportCoordinator({
    workerPath: options.importerWorkerPath,
    onProgress: (event) => {
      const window = options.getMainWindow();
      if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return;
      window.webContents.send(IPC_CHANNELS.importerProgress, event);
    },
    onCompleted: (event) => {
      const window = options.getMainWindow();
      if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return;
      window.webContents.send(IPC_CHANNELS.importerCompleted, event);
    },
  });

  const sendToWindow = (channel: string, payload: unknown): void => {
    const window = options.getMainWindow();
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return;
    window.webContents.send(channel, payload);
  };

  const credentialStore = new CredentialStore(
    path.join(app.getPath('userData'), 'reftrack-credentials-v1.bin'),
    credentialCrypto,
  );

  const checkin = new CheckinCoordinator({
    getState: () => options.stateService.getSnapshot(),
    getCredentials: (taskSiteId) => credentialStore.get(taskSiteId),
    persistResult: (date, taskSiteId, result) =>
      commands.recordCheckinResult(date, taskSiteId, result),
    onProgress: (event) => sendToWindow(IPC_CHANNELS.checkinProgress, event),
    onCompleted: (event) =>
      sendToWindow(IPC_CHANNELS.checkinCompleted, {
        ...event,
        snapshot: commands.getRendererSnapshot(),
      }),
  });

  const checkinScheduler = new CheckinScheduler({
    run: () => {
      try {
        checkin.start({ taskSiteId: null });
      } catch {
        // No enabled sites or a run already in progress — nothing to do today.
      }
    },
    onError: (error) => console.error('[RefTrack] Scheduled check-in failed to start:', error),
  });
  checkinScheduler.start();

  const pruneCheckinCredentials = async (): Promise<void> => {
    const state = options.stateService.getSnapshot();
    const ids = state.taskCategories.flatMap((category) => category.sites.map((site) => site.id));
    await credentialStore.pruneExcept(ids);
  };
  const senderOptions = {
    getMainWindow: options.getMainWindow,
    development: options.development,
    ...(options.developmentRendererUrl
      ? { developmentRendererUrl: options.developmentRendererUrl }
      : {}),
  };

  registerHandler(IPC_CHANNELS.appBootstrap, EmptyRequestSchema, () => commands.bootstrap());

  registerHandler(IPC_CHANNELS.appGetInfo, EmptyRequestSchema, (): ApplicationInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    electronVersion: process.versions.electron ?? 'Unknown',
    chromiumVersion: process.versions.chrome ?? 'Unknown',
    nodeVersion: process.versions.node,
    v8Version: process.versions.v8,
    architecture: process.arch,
    userDataPath: app.getPath('userData'),
  }));

  registerHandler(IPC_CHANNELS.sitesUpsert, SiteUpsertRequestSchema, async (request) => {
    const response = await commands.upsertSite(request);
    syncHotkeys();
    return response;
  });
  registerHandler(IPC_CHANNELS.sitesDelete, SiteDeleteRequestSchema, async (request) => {
    const response = await commands.deleteSite(request.siteId, request.occurredAt);
    syncHotkeys();
    return response;
  });
  registerHandler(IPC_CHANNELS.activityClear, EmptyRequestSchema, () => commands.clearActivity());

  registerHandler(IPC_CHANNELS.actionsCopyLink, CopyLinkRequestSchema, (request) =>
    copyActions.copy(request),
  );

  registerHandler(IPC_CHANNELS.actionsRecordSuccess, RecordSuccessRequestSchema, (request) =>
    commands.recordSuccess(request.siteId, request.occurredAt),
  );
  registerHandler(IPC_CHANNELS.actionsUndoSuccess, UndoSuccessRequestSchema, (request) =>
    commands.undoSuccess(request.activityId),
  );

  registerHandler(
    IPC_CHANNELS.settingsSetImageCleanerEnabled,
    SetImageCleanerEnabledRequestSchema,
    (request) => commands.setImageCleanerEnabled(request.enabled),
  );

  registerHandler(IPC_CHANNELS.settingsSetHotkeys, SetHotkeysRequestSchema, async (request) => {
    const response = await commands.setHotkeys(request);
    syncHotkeys();
    return response;
  });

  registerHandler(IPC_CHANNELS.windowMinimize, EmptyRequestSchema, () => {
    const window = options.getMainWindow();
    if (!window || window.isDestroyed() || !window.isMinimizable()) return { minimized: false };
    window.minimize();
    return { minimized: true };
  });

  registerHandler(
    IPC_CHANNELS.settingsSelectImageCleanerFolder,
    EmptyRequestSchema,
    async (): Promise<SelectImageCleanerFolderResponse> => {
      const ownerWindow = options.getMainWindow();
      const dialogOptions: OpenDialogOptions = {
        properties: ['openDirectory'],
        title: 'Select a dedicated screenshots or exports folder',
      };
      let result;
      try {
        result = ownerWindow
          ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
          : await dialog.showOpenDialog(dialogOptions);
      } catch (error: unknown) {
        throw new ApplicationError('FOLDER_SELECTION_FAILED', 'The folder picker could not open.', {
          recoverable: true,
          cause: error,
        });
      }

      if (result.canceled || result.filePaths.length === 0) {
        return {
          selected: false,
          folderPath: commands.getRendererSnapshot().settings.folderClearPath,
          snapshot: commands.getRendererSnapshot(),
        };
      }

      const selectedPath = result.filePaths[0];
      if (!selectedPath) {
        throw new ApplicationError('FOLDER_SELECTION_FAILED', 'No folder was selected.', {
          recoverable: true,
        });
      }
      const folderPath = await imageCleaner.validateFolder(selectedPath);
      const response = await commands.setImageCleanerFolder(folderPath);
      return { selected: true, folderPath, snapshot: response.snapshot };
    },
  );

  registerHandler(
    IPC_CHANNELS.tasksUpsertCategory,
    TaskCategoryUpsertRequestSchema,
    async (request) => {
      const response = await commands.upsertTaskCategory(request.category);
      await pruneCheckinCredentials();
      return response;
    },
  );
  registerHandler(
    IPC_CHANNELS.tasksDeleteCategory,
    TaskCategoryDeleteRequestSchema,
    async (request) => {
      const response = await commands.deleteTaskCategory(request.categoryId);
      await pruneCheckinCredentials();
      return response;
    },
  );
  registerHandler(IPC_CHANNELS.tasksSetCompletion, TaskCompletionRequestSchema, (request) =>
    commands.setTaskCompletion(request.date, request),
  );
  registerHandler(IPC_CHANNELS.tasksSetCompletions, TaskCompletionsRequestSchema, (request) =>
    commands.setTaskCompletions(request.date, request.items),
  );

  registerHandler(IPC_CHANNELS.externalOpen, OpenExternalRequestSchema, async (request) => {
    const url = validateExternalUrl(request.url);
    try {
      await shell.openExternal(url.href);
      return { opened: true as const };
    } catch (error: unknown) {
      throw new ApplicationError('EXTERNAL_URL_FAILED', 'Windows could not open that link.', {
        field: 'url',
        recoverable: true,
        cause: error,
      });
    }
  });

  registerHandler(
    IPC_CHANNELS.notificationsShowAction,
    ActionNotificationRequestSchema,
    (request) => {
      if (!Notification.isSupported()) return { shown: false };
      try {
        const title = request.kind === 'copy' ? 'Link Copied!' : '💰 Success!';
        const body =
          request.kind === 'copy'
            ? `${request.siteName} referral link copied to clipboard.`
            : `+$${centsToDollars(request.amountCents ?? 0).toFixed(2)} from ${request.siteName} recorded.`;
        new Notification({ title, body, silent: false }).show();
        return { shown: true };
      } catch (error: unknown) {
        throw new ApplicationError('NOTIFICATION_FAILED', 'The notification could not be shown.', {
          recoverable: true,
          cause: error,
        });
      }
    },
  );

  registerHandler(IPC_CHANNELS.importerStart, ImporterStartRequestSchema, (request) =>
    importer.start(request.url),
  );

  registerHandler(IPC_CHANNELS.importerCancel, ImporterCancelRequestSchema, (request) => ({
    cancelled: importer.cancel(request.jobId),
  }));

  registerHandler(IPC_CHANNELS.checkinStart, CheckinStartRequestSchema, (request) =>
    checkin.start(request),
  );

  registerHandler(IPC_CHANNELS.checkinCancel, CheckinCancelRequestSchema, (request) => ({
    cancelled: checkin.cancel(request.runId),
  }));

  registerHandler(
    IPC_CHANNELS.checkinSaveCredentials,
    CheckinSaveCredentialsRequestSchema,
    async (request) => {
      await credentialStore.set(request.taskSiteId, {
        username: request.username,
        password: request.password,
      });
      return { saved: true as const };
    },
  );

  registerHandler(
    IPC_CHANNELS.checkinDeleteCredentials,
    CheckinDeleteCredentialsRequestSchema,
    async (request) => ({ deleted: await credentialStore.delete(request.taskSiteId) }),
  );

  registerHandler(IPC_CHANNELS.checkinCredentialStatus, EmptyRequestSchema, async () => ({
    taskSiteIds: await credentialStore.listIds(),
  }));

  return {
    dispose: () => {
      importer.dispose();
      checkinScheduler.dispose();
      checkin.dispose();
      for (const channel of Object.values(IPC_CHANNELS)) ipcMain.removeHandler(channel);
    },
  };

  function syncHotkeys(): void {
    options.hotkeyService.sync(options.stateService.getSnapshot());
  }

  function registerHandler<TSchema extends z.ZodTypeAny, TResponse>(
    channel: string,
    schema: TSchema,
    handler: (
      request: z.output<TSchema>,
      event: IpcMainInvokeEvent,
    ) => Promise<TResponse> | TResponse,
  ): void {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (event, payload): Promise<IpcResult<TResponse>> => {
      try {
        assertTrustedIpcSender(event, senderOptions);
        const request = schema.parse(payload);
        return { ok: true, data: await handler(request, event) };
      } catch (error: unknown) {
        const failure = toIpcFailure(error);
        if (failure.error.code === 'INTERNAL_ERROR') {
          console.error(`[RefTrack] IPC handler failed (${channel}):`, error);
        }
        return failure;
      }
    });
  }
}

function toIpcFailure(error: unknown): IpcFailure {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    return {
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: issue?.message ?? 'The request was invalid.',
        field: issue?.path.map(String).join('.') || null,
        recoverable: true,
      },
    };
  }

  if (error instanceof ApplicationError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        field: error.options.field ?? null,
        recoverable: error.options.recoverable ?? false,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'RefTrack could not complete that operation.',
      field: null,
      recoverable: false,
    },
  };
}
