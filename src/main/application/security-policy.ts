import type { Session, WebContents } from 'electron';

import { APP_PROTOCOL, APP_PROTOCOL_HOST } from './constants';

export function isAllowedTopLevelNavigation(candidateUrl: string, applicationUrl: string): boolean {
  try {
    const candidate = new URL(candidateUrl);
    const application = new URL(applicationUrl);

    if (application.protocol === `${APP_PROTOCOL}:`) {
      return candidate.protocol === `${APP_PROTOCOL}:` && candidate.hostname === APP_PROTOCOL_HOST;
    }

    return candidate.origin === application.origin;
  } catch {
    return false;
  }
}

export function configureMainSession(session: Session, development: boolean): void {
  session.setPermissionCheckHandler(() => false);
  session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));

  session.on('will-download', (event, item) => {
    event.preventDefault();
    item.cancel();
  });

  if (!development) {
    session.webRequest.onBeforeRequest(
      {
        urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'file://*/*'],
      },
      (_details, callback) => callback({ cancel: true }),
    );
  }
}

export function hardenMainWebContents(
  webContents: WebContents,
  allowedApplicationUrl: string,
): void {
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isAllowedTopLevelNavigation(navigationUrl, allowedApplicationUrl)) {
      event.preventDefault();
    }
  });
}
