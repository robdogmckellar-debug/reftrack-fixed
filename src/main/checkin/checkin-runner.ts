import { BrowserWindow, session } from 'electron';
import type { OnBeforeRequestListenerDetails, Session } from 'electron';

import { ApplicationError } from '../services/application-error';
import { buildClickScript, buildExistsScript, buildFillLoginScript } from './checkin-scripts';
import type { ClickResult, ExistsResult, FillLoginResult } from './checkin-scripts';
import type { CheckinRunOutcome, CheckinRunnerContext } from './types';

const NAVIGATION_TIMEOUT_MS = 20_000;
const FORM_POLL_ATTEMPTS = 12;
const FORM_POLL_INTERVAL_MS = 350;
const LOGIN_SETTLE_MS = 1_800;
const POPUP_POLL_ATTEMPTS = 6;
const POPUP_POLL_INTERVAL_MS = 400;
const CHECKIN_POLL_ATTEMPTS = 12;
const CHECKIN_POLL_INTERVAL_MS = 400;
const VERIFY_POLL_ATTEMPTS = 6;
const VERIFY_POLL_INTERVAL_MS = 400;

export async function runSiteCheckin(context: CheckinRunnerContext): Promise<CheckinRunOutcome> {
  ensureNotAborted(context.signal);
  const allowedHosts = new Set([context.hostname]);
  const isolatedSession = createIsolatedSession(context.runId, context.taskSiteId, allowedHosts);

  context.reportStage('starting', `Opening a secure browser for ${context.siteName}…`);

  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    backgroundColor: '#0d1117',
    webPreferences: {
      session: isolatedSession,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      safeDialogs: true,
      spellcheck: false,
      devTools: false,
      webviewTag: false,
      plugins: false,
      backgroundThrottling: false,
    },
  });
  context.onWindowCreated?.(window);
  window.removeMenu();
  window.webContents.setAudioMuted(true);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const rejectNavigation = (event: Electron.Event, navigationUrl: string): void => {
    if (!isAllowedUrl(navigationUrl, allowedHosts)) event.preventDefault();
  };
  window.webContents.on('will-navigate', rejectNavigation);
  window.webContents.on('will-redirect', rejectNavigation);
  window.webContents.on('login', (event, _details, _authInfo, callback) => {
    event.preventDefault();
    callback();
  });

  const onAbort = (): void => {
    if (!window.isDestroyed()) window.destroy();
  };
  context.signal.addEventListener('abort', onAbort, { once: true });

  try {
    return await performCheckin(window, context);
  } finally {
    context.signal.removeEventListener('abort', onAbort);
    if (!window.isDestroyed()) window.destroy();
    isolatedSession.setPermissionCheckHandler(null);
    isolatedSession.setPermissionRequestHandler(null);
    isolatedSession.webRequest.onBeforeRequest(null);
    isolatedSession.removeAllListeners('will-download');
    await isolatedSession.clearStorageData().catch(() => undefined);
    await isolatedSession.clearCache().catch(() => undefined);
  }
}

async function performCheckin(
  window: BrowserWindow,
  context: CheckinRunnerContext,
): Promise<CheckinRunOutcome> {
  const { selectors } = context;

  context.reportStage('logging-in', `Signing in to ${context.siteName}…`);
  try {
    await withTimeout(window.loadURL(context.loginUrl), NAVIGATION_TIMEOUT_MS, window);
  } catch {
    return failure('The login page could not be loaded.');
  }
  ensureNotAborted(context.signal);

  const formReady = await pollForElement(
    window,
    selectors.passwordSelector,
    FORM_POLL_ATTEMPTS,
    FORM_POLL_INTERVAL_MS,
    context.signal,
  );
  if (!formReady) return failure('The login form was not found on the page.');

  const fillResult = await execute<FillLoginResult>(
    window,
    buildFillLoginScript(selectors, context.credentials),
  );
  if (!fillResult || !fillResult.filledUsername || !fillResult.filledPassword) {
    return failure('The username or password field could not be filled.');
  }
  if (!fillResult.clickedSubmit) {
    return failure('The login button could not be found.');
  }

  await abortableDelay(LOGIN_SETTLE_MS, context.signal);
  ensureNotAborted(context.signal);

  context.reportStage('checking-in', `Opening the daily check-in page for ${context.siteName}…`);
  try {
    await withTimeout(window.loadURL(context.checkinUrl), NAVIGATION_TIMEOUT_MS, window);
  } catch {
    return failure('The daily check-in page could not be loaded.');
  }
  ensureNotAborted(context.signal);

  await dismissPopup(window, context);

  const checkinClicked = await pollAndClick(
    window,
    selectors.checkinButtonSelector,
    CHECKIN_POLL_ATTEMPTS,
    CHECKIN_POLL_INTERVAL_MS,
    context,
  );
  if (!checkinClicked) {
    return failure('The check-in button was not found. It may already be complete for today.');
  }

  context.reportStage('verifying', `Confirming the check-in for ${context.siteName}…`);
  const verified = await verifyCheckin(window, context);
  if (!verified) {
    return failure('The check-in was triggered but could not be confirmed.');
  }

  return { status: 'success', message: `Checked in to ${context.siteName}.` };
}

async function dismissPopup(window: BrowserWindow, context: CheckinRunnerContext): Promise<void> {
  const { dismissSelector } = context.selectors;
  if (!dismissSelector.trim()) return;

  for (let attempt = 0; attempt < POPUP_POLL_ATTEMPTS; attempt += 1) {
    ensureNotAborted(context.signal);
    const result = await execute<ClickResult>(window, buildClickScript(dismissSelector));
    if (result?.clicked) {
      context.reportStage('dismissing-popup', 'Dismissed an interrupting popup.');
      await abortableDelay(POPUP_POLL_INTERVAL_MS, context.signal);
      return;
    }
    await abortableDelay(POPUP_POLL_INTERVAL_MS, context.signal);
  }
}

async function verifyCheckin(
  window: BrowserWindow,
  context: CheckinRunnerContext,
): Promise<boolean> {
  const successSelector = context.selectors.successSelector.trim();
  if (!successSelector) {
    await abortableDelay(VERIFY_POLL_INTERVAL_MS, context.signal);
    return true;
  }
  return pollForElement(
    window,
    successSelector,
    VERIFY_POLL_ATTEMPTS,
    VERIFY_POLL_INTERVAL_MS,
    context.signal,
  );
}

async function pollForElement(
  window: BrowserWindow,
  selector: string,
  attempts: number,
  intervalMs: number,
  signal: AbortSignal,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    ensureNotAborted(signal);
    const result = await execute<ExistsResult>(window, buildExistsScript(selector));
    if (result?.found) return true;
    await abortableDelay(intervalMs, signal);
  }
  return false;
}

async function pollAndClick(
  window: BrowserWindow,
  selector: string,
  attempts: number,
  intervalMs: number,
  context: CheckinRunnerContext,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    ensureNotAborted(context.signal);
    const result = await execute<ClickResult>(window, buildClickScript(selector));
    if (result?.clicked) return true;
    await abortableDelay(intervalMs, context.signal);
  }
  return false;
}

async function execute<T>(window: BrowserWindow, script: string): Promise<T | null> {
  if (window.isDestroyed() || window.webContents.isDestroyed()) return null;
  try {
    return (await window.webContents.executeJavaScript(script, true)) as T;
  } catch {
    return null;
  }
}

function createIsolatedSession(
  runId: string,
  taskSiteId: string,
  allowedHosts: Set<string>,
): Session {
  const isolatedSession = session.fromPartition(`reftrack-checkin-${runId}-${taskSiteId}`, {
    cache: false,
  });
  isolatedSession.setPermissionCheckHandler(() => false);
  isolatedSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  isolatedSession.on('will-download', (event) => {
    event.preventDefault();
  });
  isolatedSession.webRequest.onBeforeRequest(
    { urls: ['<all_urls>'] },
    (details: OnBeforeRequestListenerDetails, callback) => {
      callback({ cancel: !isAllowedUrl(details.url, allowedHosts) });
    },
  );
  return isolatedSession;
}

function isAllowedUrl(value: string, allowedHosts: Set<string>): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return allowedHosts.has(url.hostname);
  } catch {
    return false;
  }
}

async function withTimeout(
  promise: Promise<unknown>,
  timeoutMs: number,
  window: BrowserWindow,
): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          if (!window.isDestroyed()) window.destroy();
          reject(
            new ApplicationError('CHECKIN_TIMEOUT', 'A check-in page took too long to load.', {
              recoverable: true,
            }),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw cancelledError();
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = (): void => {
      clearTimeout(timeout);
      reject(cancelledError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function ensureNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw cancelledError();
}

function cancelledError(): ApplicationError {
  return new ApplicationError('CHECKIN_CANCELLED', 'The check-in run was cancelled.', {
    recoverable: true,
  });
}

function failure(message: string): CheckinRunOutcome {
  return { status: 'failed', message };
}
