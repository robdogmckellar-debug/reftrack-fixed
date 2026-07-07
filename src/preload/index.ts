import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CHANNELS } from '../shared/ipc/channels';
import type {
  ImageCleanupCompletedEvent,
  ImporterCompletedEvent,
  ImporterProgressEvent,
  RefTrackApi,
} from '../shared/ipc/contract';

const reftrackApi: RefTrackApi = {
  bootstrap: () => ipcRenderer.invoke(IPC_CHANNELS.appBootstrap),
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appGetInfo),
  },
  sites: {
    upsert: (request) => ipcRenderer.invoke(IPC_CHANNELS.sitesUpsert, request),
    delete: (request) => ipcRenderer.invoke(IPC_CHANNELS.sitesDelete, request),
  },
  activity: {
    clear: () => ipcRenderer.invoke(IPC_CHANNELS.activityClear),
  },
  actions: {
    copyLink: (request) => ipcRenderer.invoke(IPC_CHANNELS.actionsCopyLink, request),
    recordSuccess: (request) => ipcRenderer.invoke(IPC_CHANNELS.actionsRecordSuccess, request),
    undoSuccess: (request) => ipcRenderer.invoke(IPC_CHANNELS.actionsUndoSuccess, request),
  },
  settings: {
    setImageCleanerEnabled: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.settingsSetImageCleanerEnabled, request),
    selectImageCleanerFolder: () =>
      ipcRenderer.invoke(IPC_CHANNELS.settingsSelectImageCleanerFolder),
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
};

contextBridge.exposeInMainWorld('reftrack', reftrackApi);
