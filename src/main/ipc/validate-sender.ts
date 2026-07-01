import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';

import { ApplicationError } from '../services/application-error';

export interface SenderValidationOptions {
  getMainWindow(): BrowserWindow | null;
  development: boolean;
  developmentRendererUrl?: string;
}

export function assertTrustedIpcSender(
  event: IpcMainInvokeEvent,
  options: SenderValidationOptions,
): void {
  const mainWindow = options.getMainWindow();
  const senderFrame = event.senderFrame;

  if (
    !mainWindow ||
    !senderFrame ||
    mainWindow.isDestroyed() ||
    event.sender.id !== mainWindow.webContents.id ||
    senderFrame.processId !== event.sender.mainFrame.processId ||
    senderFrame.routingId !== event.sender.mainFrame.routingId ||
    !isTrustedRendererUrl(senderFrame.url, options)
  ) {
    throw new ApplicationError(
      'UNTRUSTED_SENDER',
      'The IPC request came from an untrusted frame.',
      {
        recoverable: false,
      },
    );
  }
}

export function isTrustedRendererUrl(
  candidate: string,
  options: Pick<SenderValidationOptions, 'development' | 'developmentRendererUrl'>,
): boolean {
  try {
    const url = new URL(candidate);
    if (!options.development) return url.protocol === 'reftrack:' && url.hostname === 'app';

    if (!options.developmentRendererUrl) return false;
    const developmentUrl = new URL(options.developmentRendererUrl);
    return url.origin === developmentUrl.origin;
  } catch {
    return false;
  }
}
