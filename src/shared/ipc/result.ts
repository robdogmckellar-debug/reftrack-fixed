export type IpcErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNTRUSTED_SENDER'
  | 'NOT_FOUND'
  | 'DAILY_LIMIT_REACHED'
  | 'ACTION_IN_PROGRESS'
  | 'PERSISTENCE_FAILED'
  | 'CLIPBOARD_FAILED'
  | 'NOTIFICATION_FAILED'
  | 'EXTERNAL_URL_REJECTED'
  | 'EXTERNAL_URL_FAILED'
  | 'FOLDER_SELECTION_FAILED'
  | 'FOLDER_UNAVAILABLE'
  | 'UNSAFE_PATH'
  | 'IMAGE_CLEANUP_FAILED'
  | 'IMPORT_IN_PROGRESS'
  | 'IMPORT_CANCELLED'
  | 'IMPORT_TIMEOUT'
  | 'IMPORT_NETWORK_REJECTED'
  | 'IMPORT_UNSUPPORTED_PAGE'
  | 'IMPORT_FAILED'
  | 'INTERNAL_ERROR';

export interface IpcErrorDetail {
  code: IpcErrorCode;
  message: string;
  field: string | null;
  recoverable: boolean;
}

export interface IpcSuccess<T> {
  ok: true;
  data: T;
}

export interface IpcFailure {
  ok: false;
  error: IpcErrorDetail;
}

export type IpcResult<T> = IpcSuccess<T> | IpcFailure;
