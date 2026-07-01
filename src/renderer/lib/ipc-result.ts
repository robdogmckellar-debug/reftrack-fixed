import type { IpcErrorCode, IpcResult } from '../../shared/ipc/result';

export class RendererCommandError extends Error {
  readonly code: IpcErrorCode;
  readonly field: string | null;
  readonly recoverable: boolean;

  constructor(
    code: IpcErrorCode,
    message: string,
    options: { field: string | null; recoverable: boolean },
  ) {
    super(message);
    this.name = 'RendererCommandError';
    this.code = code;
    this.field = options.field;
    this.recoverable = options.recoverable;
  }
}

export function unwrapIpcResult<T>(result: IpcResult<T>): T {
  if (result.ok) return result.data;

  throw new RendererCommandError(result.error.code, result.error.message, {
    field: result.error.field,
    recoverable: result.error.recoverable,
  });
}

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
