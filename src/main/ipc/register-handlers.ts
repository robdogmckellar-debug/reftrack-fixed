import path from 'node:path';

import {
  app,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  Notification,
  safeStorage,
  shell,
} from 'electron';
import type { BrowserWindow, IpcMainInvokeEvent, OpenDialogOptions } from 'electron';
import { z } from 'zod';

import { centsToDollars } from '../../domain/money/money';
import { IPC_CHANNELS } from '../../shared/ipc/channels';
import type {
  ApplicationInfo,
  ImageCleanupStart,
  SelectImageCleanerFolderResponse,
  SelectImageCompressorFolderResponse,
} from '../../shared/ipc/contract';
import type { IpcFailure, IpcResult } from '../../shared/ipc/result';
import {
  ActionNotificationRequestSchema,
  AddTaskSitesToCategoriesRequestSchema,
  CheckinCancelRequestSchema,
  CheckinDeleteCredentialsRequestSchema,
  CheckinSaveCredentialsRequestSchema,
  CheckinStartRequestSchema,
  CopyLinkRequestSchema,
  CopyTextRequestSchema,
  EmptyRequestSchema,
  FacebookGroupShareDeleteRequestSchema,
  FacebookGroupShareUpsertRequestSchema,
  InstallApkRequestSchema,
  ImporterCancelRequestSchema,
  ImporterStartRequestSchema,
  LaunchAndroidPackageRequestSchema,
  OpenExternalRequestSchema,
  OpenAndroidDeepLinkRequestSchema,
  PayoutDeleteRequestSchema,
  PayoutUpsertRequestSchema,
  RecordSuccessRequestSchema,
  SetCheckinScheduleRequestSchema,
  SetHotkeysRequestSchema,
  SetImageCompressorEnabledRequestSchema,
  SetImageCleanerEnabledRequestSchema,
  SetImageCleanerHotkeyRequestSchema,
  SiteDeleteRequestSchema,
  SiteLifecycleRequestSchema,
  SiteUpsertRequestSchema,
  TaskCategoryDeleteRequestSchema,
  TaskCategoryUpsertRequestSchema,
  TaskCompletionRequestSchema,
  TaskCompletionsRequestSchema,
  UndoSuccessRequestSchema,
} from '../../shared/ipc/schemas';
import { openExternalInBackground } from '../application/external-link';
import { CheckinCoordinator } from '../checkin/checkin-coordinator';
import { CredentialStore } from '../checkin/credential-store';
import type { CredentialCrypto } from '../checkin/credential-store';
import { DailyCheckinScheduler } from '../checkin/daily-checkin-scheduler';
import { ImportCoordinator } from '../importer/import-coordinator';
import { AndroidEmulatorService } from '../services/android-emulator-service';
import { ApplicationCommandService } from '../services/application-command-service';
import { CopyActionService } from '../services/copy-action-service';
import { ApplicationError } from '../services/application-error';
import type { HotkeyService } from '../services/hotkey-service';
import { ImageCleanerService, ImageCleanupCoordinator } from '../services/image-cleaner-service';
import { ImageCleanerHotkey } from '../services/image-cleaner-hotkey';
import {
  ImageCompressorService,
  ImageCompressorWatcher,
} from '../services/image-compressor-service';
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
  startBackgroundServices(): void;
  dispose(): void;
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions): IpcHandlerRegistration {
  const commands = new ApplicationCommandService(options.stateService);
  const androidEmulator = new AndroidEmulatorService();
  const imageCleaner = new ImageCleanerService({
    trashItem: (filePath) => shell.trashItem(filePath),
  });
  const imageCompressor = new ImageCompressorWatcher({
    service: new ImageCompressorService({
      convertToJpeg: async (filePath, quality) => {
        const image = nativeImage.createFromPath(filePath);
        if (image.isEmpty()) {
          throw new ApplicationError(
            'IMAGE_COMPRESSION_FAILED',
            'That image could not be loaded.',
            { field: 'folderPath', recoverable: true },
          );
        }
        return image.toJPEG(quality);
      },
    }),
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Image compression failed.';
      console.warn('[RefTrack] Image Compressor:', message);
    },
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
    writeClipboard: (text, imagePath) => writeShareClipboard(text, imagePath),
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

  const scheduledRunIds = new Set<string>();

  const checkin = new CheckinCoordinator({
    getState: () => options.stateService.getSnapshot(),
    getCredentials: (taskSiteId) => credentialStore.get(taskSiteId),
    persistResult: (date, taskSiteId, result) =>
      commands.recordCheckinResult(date, taskSiteId, result),
    onProgress: (event) => sendToWindow(IPC_CHANNELS.checkinProgress, event),
    onCompleted: (event) => {
      if (scheduledRunIds.delete(event.runId)) showScheduledCheckinCompletion(event);
      sendToWindow(IPC_CHANNELS.checkinCompleted, {
        ...event,
        snapshot: commands.getRendererSnapshot(),
      });
    },
  });

  const checkinScheduler = new DailyCheckinScheduler({
    getSchedule: () => {
      const settings = options.stateService.getSnapshot().settings.checkin;
      return {
        enabled: settings.scheduleEnabled,
        time: settings.scheduleTime,
        lastRunDate: settings.lastScheduledRunDate,
      };
    },
    startRun: () => {
      try {
        const response = checkin.start({ taskSiteId: null });
        scheduledRunIds.add(response.runId);
        return 'started';
      } catch (error: unknown) {
        if (error instanceof ApplicationError && error.code === 'CHECKIN_IN_PROGRESS') {
          return 'busy';
        }
        throw error;
      }
    },
    markAttempt: (date) => commands.markScheduledCheckinAttempt(date),
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : 'The scheduled check-in could not be started.';
      showNotification('RefTrack scheduled check-in', message);
    },
  });

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

  const runImageCleanup = (): ImageCleanupStart => {
    const { folderClearPath } = commands.getRendererSnapshot().settings;
    if (!folderClearPath) return { status: 'not-configured', jobId: null };
    return cleanupCoordinator.start(folderClearPath);
  };

  const imageCleanerHotkey = new ImageCleanerHotkey({
    onTrigger: () => {
      const outcome = runImageCleanup();
      if (outcome.status === 'not-configured' && Notification.isSupported()) {
        new Notification({
          title: 'RefTrack Image Cleaner',
          body: 'Choose a dedicated folder in Settings before running cleanup.',
        }).show();
      }
    },
  });

  const savedHotkey = commands.getRendererSnapshot().settings.folderClearHotkey ?? null;
  if (savedHotkey) {
    const result = imageCleanerHotkey.apply(savedHotkey);
    if (!result.ok) {
      console.warn(
        `[RefTrack] Could not register the saved image-cleaner shortcut "${savedHotkey}" (${result.reason}).`,
      );
    }
  }

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
  registerHandler(IPC_CHANNELS.sitesSetLifecycle, SiteLifecycleRequestSchema, async (request) => {
    const response = await commands.setSiteLifecycle(request);
    syncHotkeys();
    return response;
  });
  registerHandler(IPC_CHANNELS.sitesDelete, SiteDeleteRequestSchema, async (request) => {
    const response = await commands.deleteSite(request.siteId, request.occurredAt);
    syncHotkeys();
    return response;
  });
  registerHandler(
    IPC_CHANNELS.sitesSelectApk,
    EmptyRequestSchema,
    async (): Promise<{ selected: boolean; filePath: string | null }> => {
      const ownerWindow = options.getMainWindow();
      const dialogOptions: OpenDialogOptions = {
        properties: ['openFile'],
        title: 'Select an Android APK',
        filters: [
          { name: 'Android APK', extensions: ['apk'] },
          { name: 'All files', extensions: ['*'] },
        ],
      };
      const result = ownerWindow
        ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);

      return {
        selected: !result.canceled && result.filePaths.length > 0,
        filePath: result.filePaths[0] ?? null,
      };
    },
  );
  registerHandler(IPC_CHANNELS.sitesInstallApk, InstallApkRequestSchema, async (request) => {
    const packageName = await androidEmulator.installApk(request.apkPath, request.avdName ?? null);
    return { installed: true as const, packageName };
  });
  registerHandler(
    IPC_CHANNELS.sitesLaunchAndroidPackage,
    LaunchAndroidPackageRequestSchema,
    async (request) => {
      await androidEmulator.launchPackage(request.packageName, request.avdName ?? null);
      return { launched: true as const };
    },
  );
  registerHandler(
    IPC_CHANNELS.sitesOpenAndroidDeepLink,
    OpenAndroidDeepLinkRequestSchema,
    async (request) => {
      await androidEmulator.openDeepLink(request.url, request.avdName ?? null);
      return { opened: true as const };
    },
  );
  registerHandler(IPC_CHANNELS.activityClear, EmptyRequestSchema, () => commands.clearActivity());
  registerHandler(IPC_CHANNELS.payoutsUpsert, PayoutUpsertRequestSchema, (request) =>
    commands.upsertPayout(request),
  );
  registerHandler(IPC_CHANNELS.payoutsDelete, PayoutDeleteRequestSchema, (request) =>
    commands.deletePayout(request.payoutId),
  );

  registerHandler(IPC_CHANNELS.actionsCopyLink, CopyLinkRequestSchema, (request) =>
    copyActions.copy(request),
  );
  registerHandler(IPC_CHANNELS.actionsCopyText, CopyTextRequestSchema, (request) => {
    try {
      writeShareClipboard(request.text, request.imagePath);
      return { copied: true as const };
    } catch (error: unknown) {
      throw new ApplicationError('CLIPBOARD_FAILED', 'Windows could not update the clipboard.', {
        recoverable: true,
        cause: error,
      });
    }
  });

  registerHandler(
    IPC_CHANNELS.actionsSelectShareImage,
    EmptyRequestSchema,
    async (): Promise<{ selected: boolean; filePath: string | null }> => {
      const ownerWindow = options.getMainWindow();
      const dialogOptions: OpenDialogOptions = {
        properties: ['openFile'],
        title: 'Select a share image',
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] },
          { name: 'All files', extensions: ['*'] },
        ],
      };
      const result = ownerWindow
        ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);

      return {
        selected: !result.canceled && result.filePaths.length > 0,
        filePath: result.filePaths[0] ?? null,
      };
    },
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

  registerHandler(
    IPC_CHANNELS.settingsSetImageCompressorEnabled,
    SetImageCompressorEnabledRequestSchema,
    async (request) => {
      const response = await commands.setImageCompressorEnabled(request.enabled);
      syncImageCompressor(response.snapshot.settings);
      return response;
    },
  );

  registerHandler(IPC_CHANNELS.settingsSetHotkeys, SetHotkeysRequestSchema, async (request) => {
    const response = await commands.setHotkeys(request);
    syncHotkeys();
    return response;
  });

  registerHandler(IPC_CHANNELS.windowHideToTray, EmptyRequestSchema, () => {
    const window = options.getMainWindow();
    if (!window || window.isDestroyed()) return { hidden: false };
    window.hide();
    return { hidden: true };
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
    IPC_CHANNELS.settingsSelectImageCompressorFolder,
    EmptyRequestSchema,
    async (): Promise<SelectImageCompressorFolderResponse> => {
      const ownerWindow = options.getMainWindow();
      const dialogOptions: OpenDialogOptions = {
        properties: ['openDirectory'],
        title: 'Select a dedicated image compression folder',
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
          folderPath: commands.getRendererSnapshot().settings.imageCompressorPath ?? null,
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
      const response = await commands.setImageCompressorFolder(folderPath);
      syncImageCompressor(response.snapshot.settings);
      return { selected: true, folderPath, snapshot: response.snapshot };
    },
  );

  registerHandler(
    IPC_CHANNELS.settingsUpsertFacebookGroupShare,
    FacebookGroupShareUpsertRequestSchema,
    (request) => commands.upsertFacebookGroupShare(request),
  );

  registerHandler(
    IPC_CHANNELS.settingsDeleteFacebookGroupShare,
    FacebookGroupShareDeleteRequestSchema,
    (request) => commands.deleteFacebookGroupShare(request.groupId),
  );

  registerHandler(IPC_CHANNELS.imageCleanerRun, EmptyRequestSchema, () => runImageCleanup());

  registerHandler(
    IPC_CHANNELS.settingsSetImageCleanerHotkey,
    SetImageCleanerHotkeyRequestSchema,
    (request) => {
      const result = imageCleanerHotkey.apply(request.hotkey);
      if (!result.ok) {
        throw new ApplicationError(
          'HOTKEY_REGISTRATION_FAILED',
          result.reason === 'conflict'
            ? 'That shortcut is already used by another application.'
            : 'That keyboard shortcut is not valid.',
          { field: 'hotkey', recoverable: true },
        );
      }
      return commands.setImageCleanerHotkey(request.hotkey);
    },
  );

  registerHandler(
    IPC_CHANNELS.settingsSetCheckinSchedule,
    SetCheckinScheduleRequestSchema,
    async (request) => {
      const response = await commands.setCheckinSchedule(request);
      checkinScheduler.refresh();
      return response;
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
    IPC_CHANNELS.tasksAddSitesToCategories,
    AddTaskSitesToCategoriesRequestSchema,
    (request) => commands.addTaskSitesToCategories(request),
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
      await openExternalInBackground(url.href, options.getMainWindow(), (target) =>
        shell.openExternal(target),
      );
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
    startBackgroundServices: () => {
      checkinScheduler.start();
      syncImageCompressor(commands.getRendererSnapshot().settings);
    },
    dispose: () => {
      importer.dispose();
      imageCompressor.dispose();
      imageCleanerHotkey.dispose();
      checkinScheduler.dispose();
      checkin.dispose();
      for (const channel of Object.values(IPC_CHANNELS)) ipcMain.removeHandler(channel);
    },
  };

  function syncHotkeys(): void {
    options.hotkeyService.sync(options.stateService.getSnapshot());
  }

  function syncImageCompressor(settings: {
    imageCompressorEnabled?: boolean;
    imageCompressorPath?: string | null;
    imageCompressorQuality?: number;
  }): void {
    if (!settings.imageCompressorEnabled || !settings.imageCompressorPath) {
      imageCompressor.dispose();
      return;
    }
    imageCompressor.start(settings.imageCompressorPath, settings.imageCompressorQuality ?? 70);
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

function showScheduledCheckinCompletion(event: {
  cancelled: boolean;
  results: Array<{ status: 'success' | 'failed' | 'skipped' }>;
}): void {
  if (event.cancelled) {
    showNotification('Scheduled check-in cancelled', 'The scheduled run was stopped.');
    return;
  }

  const succeeded = event.results.filter((result) => result.status === 'success').length;
  const needsAttention = event.results.length - succeeded;
  if (needsAttention > 0) {
    showNotification(
      'Scheduled check-in needs attention',
      `${succeeded} confirmed; ${needsAttention} failed or could not be verified.`,
    );
    return;
  }

  showNotification(
    'Scheduled check-in complete',
    `${succeeded} site${succeeded === 1 ? '' : 's'} confirmed successfully.`,
  );
}

function showNotification(title: string, body: string): void {
  if (!Notification.isSupported()) return;
  try {
    new Notification({ title, body, silent: false }).show();
  } catch {
    // Notifications are best-effort and must not interrupt background work.
  }
}

function writeShareClipboard(text: string, imagePath?: string | null): void {
  if (!imagePath) {
    clipboard.writeText(text);
    return;
  }

  const image = nativeImage.createFromPath(imagePath);
  if (image.isEmpty()) {
    throw new ApplicationError('CLIPBOARD_FAILED', 'That image could not be loaded.', {
      field: 'imagePath',
      recoverable: true,
    });
  }

  clipboard.write({ text, html: plainTextToHtml(text), image });
}

function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r\n|\r|\n/g, '<br>');

  return `<meta charset="utf-8"><div>${escaped}</div>`;
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
