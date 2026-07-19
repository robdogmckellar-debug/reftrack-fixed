import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS } from '../shared/ipc/channels';
import type {
  CheckinCompletedEvent,
  CheckinProgressEvent,
  HotkeyTriggeredEvent,
  ImageCleanupCompletedEvent,
  ImporterCompletedEvent,
  ImporterProgressEvent,
  RefTrackApi,
  ShareQueueAdvanceTriggeredEvent,
} from '../shared/ipc/contract';

const reftrackApi: RefTrackApi = {
  bootstrap: () => ipcRenderer.invoke(IPC_CHANNELS.appBootstrap),
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appGetInfo),
  },
  sites: {
    upsert: (request) => ipcRenderer.invoke(IPC_CHANNELS.sitesUpsert, request),
    setLifecycle: (request) => ipcRenderer.invoke(IPC_CHANNELS.sitesSetLifecycle, request),
    delete: (request) => ipcRenderer.invoke(IPC_CHANNELS.sitesDelete, request),
    selectApk: () => ipcRenderer.invoke(IPC_CHANNELS.sitesSelectApk),
    installApk: (request) => ipcRenderer.invoke(IPC_CHANNELS.sitesInstallApk, request),
    launchAndroidPackage: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.sitesLaunchAndroidPackage, request),
    openAndroidDeepLink: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.sitesOpenAndroidDeepLink, request),
  },
  activity: {
    clear: () => ipcRenderer.invoke(IPC_CHANNELS.activityClear),
  },
  payouts: {
    upsert: (request) => ipcRenderer.invoke(IPC_CHANNELS.payoutsUpsert, request),
    delete: (request) => ipcRenderer.invoke(IPC_CHANNELS.payoutsDelete, request),
  },
  actions: {
    copyLink: (request) => ipcRenderer.invoke(IPC_CHANNELS.actionsCopyLink, request),
    copyText: (request) => ipcRenderer.invoke(IPC_CHANNELS.actionsCopyText, request),
    selectShareImage: () => ipcRenderer.invoke(IPC_CHANNELS.actionsSelectShareImage),
    recordSuccess: (request) => ipcRenderer.invoke(IPC_CHANNELS.actionsRecordSuccess, request),
    undoSuccess: (request) => ipcRenderer.invoke(IPC_CHANNELS.actionsUndoSuccess, request),
  },
  shareQueue: {
    onAdvanceHotkey: (listener) => {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        payload: ShareQueueAdvanceTriggeredEvent,
      ): void => {
        listener(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.shareQueueAdvanceTriggered, wrapped);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.shareQueueAdvanceTriggered, wrapped);
    },
  },
  settings: {
    setImageCleanerEnabled: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.settingsSetImageCleanerEnabled, request),
    selectImageCleanerFolder: () =>
      ipcRenderer.invoke(IPC_CHANNELS.settingsSelectImageCleanerFolder),
    setImageCleanerHotkey: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.settingsSetImageCleanerHotkey, request),
    setImageCompressorEnabled: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.settingsSetImageCompressorEnabled, request),
    selectImageCompressorFolder: () =>
      ipcRenderer.invoke(IPC_CHANNELS.settingsSelectImageCompressorFolder),
    upsertFacebookGroupShare: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.settingsUpsertFacebookGroupShare, request),
    deleteFacebookGroupShare: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.settingsDeleteFacebookGroupShare, request),
    setCheckinSchedule: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.settingsSetCheckinSchedule, request),
    setHotkeys: (request) => ipcRenderer.invoke(IPC_CHANNELS.settingsSetHotkeys, request),
  },
  window: {
    hideToTray: () => ipcRenderer.invoke(IPC_CHANNELS.windowHideToTray),
  },
  hotkeys: {
    onTriggered: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: HotkeyTriggeredEvent): void => {
        listener(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.hotkeyTriggered, wrapped);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.hotkeyTriggered, wrapped);
    },
  },
  imageCleaner: {
    run: () => ipcRenderer.invoke(IPC_CHANNELS.imageCleanerRun),
    onCompleted: (listener) => {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        payload: ImageCleanupCompletedEvent,
      ): void => {
        listener(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.imageCleanerCompleted, wrapped);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.imageCleanerCompleted, wrapped);
    },
  },
  tasks: {
    upsertCategory: (request) => ipcRenderer.invoke(IPC_CHANNELS.tasksUpsertCategory, request),
    addSitesToCategories: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.tasksAddSitesToCategories, request),
    deleteCategory: (request) => ipcRenderer.invoke(IPC_CHANNELS.tasksDeleteCategory, request),
    setCompletion: (request) => ipcRenderer.invoke(IPC_CHANNELS.tasksSetCompletion, request),
    setCompletions: (request) => ipcRenderer.invoke(IPC_CHANNELS.tasksSetCompletions, request),
  },
  external: {
    open: (request) => ipcRenderer.invoke(IPC_CHANNELS.externalOpen, request),
  },
  notifications: {
    showAction: (request) => ipcRenderer.invoke(IPC_CHANNELS.notificationsShowAction, request),
  },
  importer: {
    start: (request) => ipcRenderer.invoke(IPC_CHANNELS.importerStart, request),
    cancel: (request) => ipcRenderer.invoke(IPC_CHANNELS.importerCancel, request),
    onProgress: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: ImporterProgressEvent): void => {
        listener(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.importerProgress, wrapped);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.importerProgress, wrapped);
    },
    onCompleted: (listener) => {
      const wrapped = (
        _event: Electron.IpcRendererEvent,
        payload: ImporterCompletedEvent,
      ): void => {
        listener(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.importerCompleted, wrapped);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.importerCompleted, wrapped);
    },
  },
  checkin: {
    start: (request) => ipcRenderer.invoke(IPC_CHANNELS.checkinStart, request),
    cancel: (request) => ipcRenderer.invoke(IPC_CHANNELS.checkinCancel, request),
    saveCredentials: (request) => ipcRenderer.invoke(IPC_CHANNELS.checkinSaveCredentials, request),
    deleteCredentials: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.checkinDeleteCredentials, request),
    credentialStatus: () => ipcRenderer.invoke(IPC_CHANNELS.checkinCredentialStatus),
    onProgress: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: CheckinProgressEvent): void => {
        listener(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.checkinProgress, wrapped);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.checkinProgress, wrapped);
    },
    onCompleted: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, payload: CheckinCompletedEvent): void => {
        listener(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.checkinCompleted, wrapped);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.checkinCompleted, wrapped);
    },
  },
};

contextBridge.exposeInMainWorld('reftrack', reftrackApi);
