import type { IpcErrorCode, IpcResult } from './result';
import type {
  RendererSnapshot,
  RendererTaskCategory,
  RendererTaskSite,
} from '../view-model/renderer-snapshot';

export interface ApplicationInfo {
  name: string;
  version: string;
  electronVersion: string;
  chromiumVersion: string;
  nodeVersion: string;
  v8Version: string;
  architecture: string;
  userDataPath: string;
}

export interface SnapshotResponse {
  snapshot: RendererSnapshot;
}

export interface StorageStatus {
  /** Where the loaded state came from. `primary` is the normal, healthy case. */
  source: 'primary' | 'backup' | 'default';
  /** True when the primary file could not be read and a fallback was used. */
  recovered: boolean;
  /** Absolute path of the archived unreadable file, when one was set aside. */
  archivedPath: string | null;
}

export interface BootstrapResponse extends SnapshotResponse {
  storage: StorageStatus;
}

export interface SiteUpsertRequest {
  id: string | null;
  name: string;
  url: string;
  prefix: string;
  suffix: string;
  dateFormat: string;
  bonusCents: number;
  maxCopiesPerDay: number;
  notes: string;
  payoutThresholdCents: number;
  appClaim: {
    enabled: boolean;
    downloadUrl: string;
    apkPath: string | null;
    packageName: string;
    deepLinkUrl: string;
    avdName: string;
  };
}

export interface SelectApkResponse {
  selected: boolean;
  filePath: string | null;
}

export interface InstallApkRequest {
  apkPath: string;
  avdName?: string | null;
}

export interface InstallApkResponse {
  installed: true;
  packageName: string | null;
}

export interface LaunchAndroidPackageRequest {
  packageName: string;
  avdName?: string | null;
}

export interface OpenAndroidDeepLinkRequest {
  url: string;
  avdName?: string | null;
}

export interface SiteUpsertResponse extends SnapshotResponse {
  siteId: string;
}

export interface SiteDeleteRequest {
  siteId: string;
  occurredAt: string;
}

export interface SiteLifecycleRequest {
  siteId: string;
  lifecycle: 'active' | 'archived' | 'trashed';
  occurredAt: string;
}

export interface PayoutUpsertRequest {
  id: string | null;
  siteId: string;
  amountCents: number;
  expectedDate: string;
  paidAt: string | null;
  occurredAt: string;
  note: string;
}

export interface PayoutUpsertResponse extends SnapshotResponse {
  payoutId: string;
}

export interface PayoutDeleteRequest {
  payoutId: string;
}

export interface CopyLinkRequest {
  siteId: string;
  text: string;
  occurredAt: string;
  imagePath?: string | null | undefined;
}

export interface CopyTextRequest {
  text: string;
  imagePath?: string | null | undefined;
}

export interface SelectShareImageResponse {
  selected: boolean;
  filePath: string | null;
}

export interface ShareQueueAdvanceTriggeredEvent {
  accelerator: string;
}

export type ImageCleanupStart =
  | { status: 'disabled'; jobId: null }
  | { status: 'not-configured'; jobId: null }
  | { status: 'started'; jobId: string }
  | { status: 'busy'; jobId: string };

export interface CopyLinkResponse extends SnapshotResponse {
  cleanup: ImageCleanupStart;
}

export interface ImageCleanupFailureDetail {
  fileName: string;
  reason: string;
}

export interface ImageCleanupCompletedEvent {
  jobId: string;
  folderPath: string;
  startedAt: string;
  completedAt: string;
  ok: boolean;
  scanned: number;
  eligible: number;
  movedToRecycleBin: number;
  skipped: number;
  failed: number;
  failures: ImageCleanupFailureDetail[];
  errorCode: IpcErrorCode | null;
  errorMessage: string | null;
}

export interface RecordSuccessRequest {
  siteId: string;
  occurredAt: string;
}

export interface RecordSuccessResponse extends SnapshotResponse {
  activityId: string;
  bonusCents: number;
}

export interface UndoSuccessRequest {
  activityId: string;
}

export interface SetImageCleanerEnabledRequest {
  enabled: boolean;
}

export interface SetImageCompressorEnabledRequest {
  enabled: boolean;
}

export interface FacebookGroupShareUpsertRequest {
  id: string | null;
  label: string;
  groupUrl: string;
  currentPostUrl: string | null;
  useMostRecentPost: boolean;
}

export interface FacebookGroupShareUpsertResponse extends SnapshotResponse {
  groupId: string;
}

export interface FacebookGroupShareDeleteRequest {
  groupId: string;
}

export interface SetImageCleanerHotkeyRequest {
  hotkey: string | null;
}

export interface SetCheckinScheduleRequest {
  enabled: boolean;
  time: string;
}

export interface HotkeyBindingRequest {
  siteId: string;
  key: string;
}

export interface SetHotkeysRequest {
  enabled: boolean;
  bindings: HotkeyBindingRequest[];
}

export interface HotkeyTriggeredEvent {
  siteId: string;
}

export interface SelectImageCleanerFolderResponse extends SnapshotResponse {
  selected: boolean;
  folderPath: string | null;
}

export interface SelectImageCompressorFolderResponse extends SnapshotResponse {
  selected: boolean;
  folderPath: string | null;
}

export interface TaskCategoryUpsertRequest {
  category: RendererTaskCategory;
}

export interface TaskCategoryUpsertResponse extends SnapshotResponse {
  categoryId: string;
}

export interface AddTaskSitesToCategoriesRequest {
  sites: RendererTaskSite[];
  categoryIds: string[];
  newCategory: {
    id: string;
    name: string;
    colour: RendererTaskCategory['colour'];
  } | null;
}

export interface AddTaskSitesToCategoriesResponse extends SnapshotResponse {
  categoryIds: string[];
}

export interface TaskCategoryDeleteRequest {
  categoryId: string;
}

export interface TaskCompletionRequest {
  date: string;
  categoryId: string;
  siteId: string;
  done: boolean;
}

export interface TaskCompletionItem {
  categoryId: string;
  siteId: string;
  done: boolean;
}

export interface TaskCompletionsRequest {
  date: string;
  items: TaskCompletionItem[];
}

export interface OpenExternalRequest {
  url: string;
}

export interface ActionNotificationRequest {
  kind: 'copy' | 'success';
  siteName: string;
  amountCents: number | null;
}

export interface ImportPartnerSite {
  name: string;
  url: string;
}

export type ImporterMethod = 'static' | 'browser';

export type ImporterStage =
  | 'validating'
  | 'connecting'
  | 'downloading'
  | 'analysing'
  | 'browser-starting'
  | 'browser-loading'
  | 'browser-rendering'
  | 'finalising';

export interface ImporterStartRequest {
  url: string;
}

export interface ImporterStartResponse {
  jobId: string;
}

export interface ImporterCancelRequest {
  jobId: string;
}

export interface ImporterCancelResponse {
  cancelled: boolean;
}

export interface ImporterProgressEvent {
  jobId: string;
  stage: ImporterStage;
  message: string;
  percent: number | null;
}

export interface ImporterResult {
  brandName: string;
  sites: ImportPartnerSite[];
  method: ImporterMethod;
  confidence: number;
  warnings: string[];
  sourceUrl: string;
  finalUrl: string;
}

export type ImporterCompletedEvent =
  | {
      jobId: string;
      ok: true;
      result: ImporterResult;
    }
  | {
      jobId: string;
      ok: false;
      error: {
        code: IpcErrorCode;
        message: string;
        recoverable: boolean;
      };
    };

export type CheckinSiteStatus = 'success' | 'failed' | 'skipped';

export interface CheckinStartRequest {
  taskSiteId: string | null;
}

export interface CheckinStartResponse {
  runId: string;
  targetCount: number;
}

export interface CheckinCancelRequest {
  runId: string;
}

export interface CheckinCancelResponse {
  cancelled: boolean;
}

export interface CheckinSaveCredentialsRequest {
  taskSiteId: string;
  username: string;
  password: string;
}

export interface CheckinSaveCredentialsResponse {
  saved: true;
}

export interface CheckinDeleteCredentialsRequest {
  taskSiteId: string;
}

export interface CheckinDeleteCredentialsResponse {
  deleted: boolean;
}

export interface CheckinCredentialStatusResponse {
  taskSiteIds: string[];
}

export type CheckinProgressStage =
  'starting' | 'logging-in' | 'dismissing-popup' | 'checking-in' | 'verifying' | 'site-complete';

export interface CheckinProgressEvent {
  runId: string;
  taskSiteId: string;
  siteName: string;
  index: number;
  total: number;
  stage: CheckinProgressStage;
  message: string;
  status: CheckinSiteStatus | null;
}

export interface CheckinSiteResult {
  taskSiteId: string;
  siteName: string;
  status: CheckinSiteStatus;
  message: string;
}

export interface CheckinCompletedEvent {
  runId: string;
  cancelled: boolean;
  results: CheckinSiteResult[];
  snapshot: RendererSnapshot;
}

export interface RefTrackApi {
  bootstrap(): Promise<IpcResult<BootstrapResponse>>;
  app: {
    getInfo(): Promise<IpcResult<ApplicationInfo>>;
  };
  sites: {
    upsert(request: SiteUpsertRequest): Promise<IpcResult<SiteUpsertResponse>>;
    setLifecycle(request: SiteLifecycleRequest): Promise<IpcResult<SnapshotResponse>>;
    delete(request: SiteDeleteRequest): Promise<IpcResult<SnapshotResponse>>;
    selectApk(): Promise<IpcResult<SelectApkResponse>>;
    installApk(request: InstallApkRequest): Promise<IpcResult<InstallApkResponse>>;
    launchAndroidPackage(
      request: LaunchAndroidPackageRequest,
    ): Promise<IpcResult<{ launched: true }>>;
    openAndroidDeepLink(request: OpenAndroidDeepLinkRequest): Promise<IpcResult<{ opened: true }>>;
  };
  activity: {
    clear(): Promise<IpcResult<SnapshotResponse>>;
  };
  payouts: {
    upsert(request: PayoutUpsertRequest): Promise<IpcResult<PayoutUpsertResponse>>;
    delete(request: PayoutDeleteRequest): Promise<IpcResult<SnapshotResponse>>;
  };
  actions: {
    copyLink(request: CopyLinkRequest): Promise<IpcResult<CopyLinkResponse>>;
    copyText(request: CopyTextRequest): Promise<IpcResult<{ copied: true }>>;
    selectShareImage(): Promise<IpcResult<SelectShareImageResponse>>;
    recordSuccess(request: RecordSuccessRequest): Promise<IpcResult<RecordSuccessResponse>>;
    undoSuccess(request: UndoSuccessRequest): Promise<IpcResult<SnapshotResponse>>;
  };
  shareQueue: {
    onAdvanceHotkey(listener: (event: ShareQueueAdvanceTriggeredEvent) => void): () => void;
  };
  settings: {
    setImageCleanerEnabled(
      request: SetImageCleanerEnabledRequest,
    ): Promise<IpcResult<SnapshotResponse>>;
    selectImageCleanerFolder(): Promise<IpcResult<SelectImageCleanerFolderResponse>>;
    setImageCleanerHotkey(
      request: SetImageCleanerHotkeyRequest,
    ): Promise<IpcResult<SnapshotResponse>>;
    setImageCompressorEnabled(
      request: SetImageCompressorEnabledRequest,
    ): Promise<IpcResult<SnapshotResponse>>;
    selectImageCompressorFolder(): Promise<IpcResult<SelectImageCompressorFolderResponse>>;
    upsertFacebookGroupShare(
      request: FacebookGroupShareUpsertRequest,
    ): Promise<IpcResult<FacebookGroupShareUpsertResponse>>;
    deleteFacebookGroupShare(
      request: FacebookGroupShareDeleteRequest,
    ): Promise<IpcResult<SnapshotResponse>>;
    setCheckinSchedule(request: SetCheckinScheduleRequest): Promise<IpcResult<SnapshotResponse>>;
    setHotkeys(request: SetHotkeysRequest): Promise<IpcResult<SnapshotResponse>>;
  };
  window: {
    hideToTray(): Promise<IpcResult<{ hidden: boolean }>>;
  };
  hotkeys: {
    onTriggered(listener: (event: HotkeyTriggeredEvent) => void): () => void;
  };
  imageCleaner: {
    run(): Promise<IpcResult<ImageCleanupStart>>;
    onCompleted(listener: (event: ImageCleanupCompletedEvent) => void): () => void;
  };
  tasks: {
    upsertCategory(
      request: TaskCategoryUpsertRequest,
    ): Promise<IpcResult<TaskCategoryUpsertResponse>>;
    addSitesToCategories(
      request: AddTaskSitesToCategoriesRequest,
    ): Promise<IpcResult<AddTaskSitesToCategoriesResponse>>;
    deleteCategory(request: TaskCategoryDeleteRequest): Promise<IpcResult<SnapshotResponse>>;
    setCompletion(request: TaskCompletionRequest): Promise<IpcResult<SnapshotResponse>>;
    setCompletions(request: TaskCompletionsRequest): Promise<IpcResult<SnapshotResponse>>;
  };
  external: {
    open(request: OpenExternalRequest): Promise<IpcResult<{ opened: true }>>;
  };
  notifications: {
    showAction(request: ActionNotificationRequest): Promise<IpcResult<{ shown: boolean }>>;
  };
  importer: {
    start(request: ImporterStartRequest): Promise<IpcResult<ImporterStartResponse>>;
    cancel(request: ImporterCancelRequest): Promise<IpcResult<ImporterCancelResponse>>;
    onProgress(listener: (event: ImporterProgressEvent) => void): () => void;
    onCompleted(listener: (event: ImporterCompletedEvent) => void): () => void;
  };
  checkin: {
    start(request: CheckinStartRequest): Promise<IpcResult<CheckinStartResponse>>;
    cancel(request: CheckinCancelRequest): Promise<IpcResult<CheckinCancelResponse>>;
    saveCredentials(
      request: CheckinSaveCredentialsRequest,
    ): Promise<IpcResult<CheckinSaveCredentialsResponse>>;
    deleteCredentials(
      request: CheckinDeleteCredentialsRequest,
    ): Promise<IpcResult<CheckinDeleteCredentialsResponse>>;
    credentialStatus(): Promise<IpcResult<CheckinCredentialStatusResponse>>;
    onProgress(listener: (event: CheckinProgressEvent) => void): () => void;
    onCompleted(listener: (event: CheckinCompletedEvent) => void): () => void;
  };
}
