import type { IpcErrorCode } from './error-codes';

export type { IpcErrorCode };

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
