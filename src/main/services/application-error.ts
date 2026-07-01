import type { IpcErrorCode } from '../../shared/ipc/result';

export class ApplicationError extends Error {
  constructor(
    public readonly code: IpcErrorCode,
    message: string,
    public readonly options: {
      field?: string;
      recoverable?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApplicationError';
  }
}
