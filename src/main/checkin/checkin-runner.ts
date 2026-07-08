import { BrowserWindow, session } from 'electron';
import type { Session } from 'electron';

import { ApplicationError } from '../services/application-error';
import {
  buildClickScript,
  buildExistsScript,
  buildFillLoginScript,
  buildTextIncludesScript,
} from './checkin-scripts';
import type { ClickResult, ExistsResult, FillLoginResult } from './checkin-scripts';
import type { CheckinRunOutcome, CheckinRunnerContext } from './types';

const NAVIGATION_TIMEOUT_MS = 25_000;
const FORM_POLL_ATTEMPTS = 20;
const FORM_POLL_INTERVAL_MS = 400;
const INITIAL_SETTLE_MS = 600;
const LOGIN_SETTLE_MS = 2_500;
const LOGIN_VERIFY_ATTEMPTS = 12;
const LOGIN_VERIFY_INTERVAL_MS = 500;
const POPUP_POLL_ATTEMPTS = 8;
const POPUP_POLL_INTERVAL_MS = 400;
const CHECKIN_POLL_ATTEMPTS = 16;
const CHECKIN_POLL_INTERVAL_MS = 400;
const VERIFY_POLL_ATTEMPTS = 10;
const VERIFY_POLL_INTERVAL_MS = 500;
// Time to keep the window alive after a confirmed check-in so the site's
// asynchronous "record my check-in" request can reach the server before the
// isolated session is torn down.
const POST_CHECKIN_SETTLE_MS = 4_000;

// Text shown by the sites when a daily check-in has registered (or was already
// registered earlier today). Matched case-insensitively against page text.
const SUCCESS_TEXT = [
  'congratulation',
  'you have earned',
  'token today',
  'checked in',
  'check-in complete',
  'check in complete',
  'already checked',
  'come back tomorrow',
  'see you tomorrow',
];

// Built-in fallbacks appended after the user-configured selectors so the flow
// keeps working even when a site's markup differs from the stored defaults.
const USERNAME_FALLBACKS = [
  'form input[type="text"]',
  'form input[type="email"]',
  'form input[name="username"]',
  'form input[name="email"]',
  'form input[name="account"]',
  'input[type="email"]',
  'input[name="username"]',
  'input[type="text"]',
];
const PASSWORD_FALLBACKS = ['form input[type="password"]', 'input[type="password"]'];
const SUBMIT_FALLBACKS = [
  'form a.btn.login',
  'form .btn.login',
  'a.btn.login',
  '.btn.login',
  'form button[type="submit"]',
  'button[type="submit"]',
];
const CHECKIN_FALLBACKS = [
  '.checkin-page-button-container button.checkin-page-button',
  'button.checkin-page-button',
  '.checkin-page-button',
];
const DISMISS_FALLBACKS = ['button.btn-secondary-flex', '.btn-secondary-flex'];

function selectorList(configured: string, fallbacks: string[]): string[] {
  const list = configured.trim() ? [configured.trim(), ...fallbacks] : [...fallbacks];
  return [...new Set(list)];
}

export async function runSiteCheckin(context: CheckinRunnerContext): Promise<CheckinRunOutcome> {
  ensureNotAborted(context.signal);
  const registrableDomain = registrableDomainOf(context.hostname);
  const isolatedSession = createIsolatedSession(context.runId, context.taskSiteId);

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

  // Keep the window from wandering off to unrelated hosts, but allow the site's
  // own subdomains / apex + www variants so real login and post-login redirects
  // work. Sub-resource requests (scripts, styles, fonts, CDNs) are NOT blocked,
  // otherwise JS-rendered login forms and challenge pages never appear.
  const rejectNavigation = (event: Electron.Event, navigationUrl: string): void => {
    if (!isAllowedNavigation(navigationUrl, registrableDomain)) event.preventDefault();
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
  const usernameSelectors = selectorList(selectors.usernameSelector, USERNAME_FALLBACKS);
  const passwordSelectors = selectorList(selectors.passwordSelector, PASSWORD_FALLBACKS);
  const submitSelectors = selectorList(selectors.submitSelector, SUBMIT_FALLBACKS);
  const checkinSelectors = selectorList(selectors.checkinButtonSelector, CHECKIN_FALLBACKS);
  const dismissSelectors = selectorList(selectors.dismissSelector, DISMISS_FALLBACKS);

  context.reportStage('logging-in', `Signing in to ${context.siteName}…`);
  try {
    await withTimeout(window.loadURL(context.loginUrl), NAVIGATION_TIMEOUT_MS, window);
  } catch {
    return failure(`The login page (${context.loginUrl}) could not be loaded.`);
  }
  ensureNotAborted(context.signal);
  await abortableDelay(INITIAL_SETTLE_MS, context.signal);

  const formReady = await pollForElement(
    window,
    passwordSelectors,
    FORM_POLL_ATTEMPTS,
    FORM_POLL_INTERVAL_MS,
    context.signal,
  );
  if (!formReady) {
    return failure(
      `No password field was found at ${currentUrl(window) ?? context.loginUrl}. The login page may not have finished loading or uses different fields.`,
    );
  }

  const fillResult = await execute<FillLoginResult>(
    window,
    buildFillLoginScript(
      { usernameSelectors, passwordSelectors, submitSelectors },
      context.credentials,
    ),
  );
  if (!fillResult || !fillResult.filledUsername || !fillResult.filledPassword) {
    return failure('The username or password field could not be filled.');
  }
  if (!fillResult.clickedSubmit) {
    return failure('The login button could not be found.');
  }

  await abortableDelay(LOGIN_SETTLE_MS, context.signal);
  ensureNotAborted(context.signal);

  const loggedIn = await waitForLogin(window, context, passwordSelectors);
  if (!loggedIn) {
    return failure(
      'Login did not complete — the login form is still showing. Check the saved username and password for this site.',
    );
  }

  context.reportStage('checking-in', `Opening the daily check-in page for ${context.siteName}…`);
  try {
    await withTimeout(window.loadURL(context.checkinUrl), NAVIGATION_TIMEOUT_MS, window);
  } catch {
    return failure(`The daily check-in page (${context.checkinUrl}) could not be loaded.`);
  }
  ensureNotAborted(context.signal);
  await abortableDelay(INITIAL_SETTLE_MS, context.signal);

  await dismissPopup(window, context, dismissSelectors);

  const checkinClicked = await pollAndClick(
    window,
    checkinSelectors,
    CHECKIN_POLL_ATTEMPTS,
    CHECKIN_POLL_INTERVAL_MS,
    context,
  );
  if (!checkinClicked) {
    // The button may be absent because today's check-in is already done. Treat
    // an existing "already checked in" confirmation as success; otherwise fail.
    const already = await hasSuccessConfirmation(window, context, 1);
    if (already) {
      return { status: 'success', message: `${context.siteName} was already checked in today.` };
    }
    return failure('The check-in button was not found. It may already be complete for today.');
  }

  context.reportStage('verifying', `Confirming the check-in for ${context.siteName}…`);
  const verified = await verifyCheckin(window, context);

  // Keep the window open briefly so the site's asynchronous request that records
  // the check-in can reach the server before the session is destroyed.
  await abortableDelay(POST_CHECKIN_SETTLE_MS, context.signal);

  if (!verified) {
    return failure(
      'The check-in button was clicked but no confirmation appeared, so it may not have registered.',
    );
  }

  return { status: 'success', message: `Checked in to ${context.siteName}.` };
}

async function waitForLogin(
  window: BrowserWindow,
  context: CheckinRunnerContext,
  passwordSelectors: string[],
): Promise<boolean> {
  const loginPath = pathnameOf(context.loginUrl);

  for (let attempt = 0; attempt < LOGIN_VERIFY_ATTEMPTS; attempt += 1) {
    ensureNotAborted(context.signal);

    const current = currentUrl(window);
    if (current && pathnameOf(current) !== loginPath) return true;

    const formPresent = await execute<ExistsResult>(window, buildExistsScript(passwordSelectors));
    if (formPresent && !formPresent.found) return true;

    await abortableDelay(LOGIN_VERIFY_INTERVAL_MS, context.signal);
  }
  return false;
}

async function dismissPopup(
  window: BrowserWindow,
  context: CheckinRunnerContext,
  dismissSelectors: string[],
): Promise<void> {
  if (dismissSelectors.length === 0) return;

  for (let attempt = 0; attempt < POPUP_POLL_ATTEMPTS; attempt += 1) {
    ensureNotAborted(context.signal);
    const result = await execute<ClickResult>(window, buildClickScript(dismissSelectors));
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
  for (let attempt = 0; attempt < VERIFY_POLL_ATTEMPTS; attempt += 1) {
    ensureNotAborted(context.signal);

    if (successSelector) {
      const found = await execute<ExistsResult>(window, buildExistsScript([successSelector]));
      if (found?.found) return true;
    }

    const confirmation = await execute<ExistsResult>(window, buildTextIncludesScript(SUCCESS_TEXT));
    if (confirmation?.found) return true;

    await abortableDelay(VERIFY_POLL_INTERVAL_MS, context.signal);
  }
  return false;
}

async function hasSuccessConfirmation(
  window: BrowserWindow,
  context: CheckinRunnerContext,
  attempts: number,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    ensureNotAborted(context.signal);
    const confirmation = await execute<ExistsResult>(window, buildTextIncludesScript(SUCCESS_TEXT));
    if (confirmation?.found) return true;
    if (attempt < attempts - 1) await abortableDelay(VERIFY_POLL_INTERVAL_MS, context.signal);
  }
  return false;
}

function pathnameOf(value: string): string {
  try {
    return new URL(value).pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

async function pollForElement(
  window: BrowserWindow,
  selectors: string[],
  attempts: number,
  intervalMs: number,
  signal: AbortSignal,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    ensureNotAborted(signal);
    const result = await execute<ExistsResult>(window, buildExistsScript(selectors));
    if (result?.found) return true;
    await abortableDelay(intervalMs, signal);
  }
  return false;
}

async function pollAndClick(
  window: BrowserWindow,
  selectors: string[],
  attempts: number,
  intervalMs: number,
  context: CheckinRunnerContext,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    ensureNotAborted(context.signal);
    const result = await execute<ClickResult>(window, buildClickScript(selectors));
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

function currentUrl(window: BrowserWindow): string | null {
  if (window.isDestroyed() || window.webContents.isDestroyed()) return null;
  const url = window.webContents.getURL();
  return url || null;
}

function createIsolatedSession(runId: string, taskSiteId: string): Session {
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
  return isolatedSession;
}

function registrableDomainOf(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/\.$/, '').split('.');
  if (labels.length <= 2) return labels.join('.');
  return labels.slice(-2).join('.');
}

function isAllowedNavigation(value: string, registrableDomain: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return registrableDomainOf(url.hostname) === registrableDomain;
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
