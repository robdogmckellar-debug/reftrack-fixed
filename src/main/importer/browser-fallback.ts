import { BrowserWindow, session } from 'electron';
import type { OnBeforeRequestListenerDetails, Session } from 'electron';

import { ApplicationError } from '../services/application-error';
import { extractPartnerData } from './static-extractor';
import { validateImporterUrl } from './network-policy';
import type { BrowserImportResult, ImportProgressReporter } from './types';

const BROWSER_TIMEOUT_MS = 18_000;
const MAX_RENDERED_HTML_BYTES = 2 * 1024 * 1024;
const DOM_POLL_INTERVAL_MS = 350;
const DOM_POLL_ATTEMPTS = 7;

export interface BrowserFallbackOptions {
  jobId: string;
  sourceUrl: string;
  finalUrl: string;
  signal: AbortSignal;
  reportProgress: ImportProgressReporter;
  onWindowCreated?: (window: BrowserWindow) => void;
}

export async function runBrowserFallback(
  options: BrowserFallbackOptions,
): Promise<BrowserImportResult> {
  const initialUrl = validateImporterUrl(options.finalUrl);
  const allowedHosts = new Set(
    [options.sourceUrl, options.finalUrl].map((value) => validateImporterUrl(value).hostname),
  );
  const isolatedSession = createIsolatedSession(options.jobId, allowedHosts);

  options.reportProgress({
    stage: 'browser-starting',
    message: 'Static extraction was inconclusive. Starting an isolated browser…',
    percent: 76,
  });

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
  options.onWindowCreated?.(window);
  window.removeMenu();
  window.webContents.setAudioMuted(true);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const rejectNavigation = (event: Electron.Event, navigationUrl: string): void => {
    if (!isAllowedBrowserUrl(navigationUrl, allowedHosts)) event.preventDefault();
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
  options.signal.addEventListener('abort', onAbort, { once: true });

  try {
    ensureNotAborted(options.signal);
    options.reportProgress({
      stage: 'browser-loading',
      message: 'Loading the approved HTTPS page in the isolated browser…',
      percent: 80,
    });

    await withTimeout(window.loadURL(initialUrl.href), BROWSER_TIMEOUT_MS, () => {
      if (!window.isDestroyed()) window.destroy();
    });
    ensureNotAborted(options.signal);

    options.reportProgress({
      stage: 'browser-rendering',
      message: 'Inspecting the rendered page for partner links…',
      percent: 88,
    });

    let best: BrowserImportResult | null = null;
    let stableSignature = '';
    let stableCount = 0;

    for (let attempt = 0; attempt < DOM_POLL_ATTEMPTS; attempt += 1) {
      ensureNotAborted(options.signal);
      const html = await readRenderedHtml(window);
      const currentUrl = validateImporterUrl(window.webContents.getURL()).href;
      const extracted = extractPartnerData(html, currentUrl);
      const candidate: BrowserImportResult = {
        ...extracted,
        finalUrl: currentUrl,
      };

      if (
        !best ||
        candidate.sites.length > best.sites.length ||
        candidate.confidence > best.confidence
      ) {
        best = candidate;
      }

      const signature = candidate.sites.map((site) => site.url).join('|');
      if (signature && signature === stableSignature) stableCount += 1;
      else stableCount = 0;
      stableSignature = signature;

      options.reportProgress({
        stage: 'browser-rendering',
        message: `Inspecting rendered content… ${candidate.sites.length} candidate site${candidate.sites.length === 1 ? '' : 's'}`,
        percent: Math.min(96, 88 + attempt),
      });

      if ((candidate.confidence >= 0.65 && stableCount >= 1) || stableCount >= 2) break;
      await abortableDelay(DOM_POLL_INTERVAL_MS, options.signal);
    }

    if (!best) {
      throw new ApplicationError(
        'IMPORT_UNSUPPORTED_PAGE',
        'The rendered page could not be inspected.',
        { field: 'url', recoverable: true },
      );
    }
    return best;
  } catch (error: unknown) {
    if (options.signal.aborted) throw cancelledError();
    if (error instanceof ApplicationError) throw error;
    throw new ApplicationError(
      'IMPORT_FAILED',
      'The isolated browser could not extract this page.',
      { field: 'url', recoverable: true, cause: error },
    );
  } finally {
    options.signal.removeEventListener('abort', onAbort);
    if (!window.isDestroyed()) window.destroy();
    isolatedSession.setPermissionCheckHandler(null);
    isolatedSession.setPermissionRequestHandler(null);
    isolatedSession.webRequest.onBeforeRequest(null);
    isolatedSession.removeAllListeners('will-download');
    await isolatedSession.clearStorageData().catch(() => undefined);
    await isolatedSession.clearCache().catch(() => undefined);
  }
}

function createIsolatedSession(jobId: string, allowedHosts: Set<string>): Session {
  const isolatedSession = session.fromPartition(`reftrack-import-${jobId}`, { cache: false });
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
      callback({ cancel: !isAllowedBrowserUrl(details.url, allowedHosts) });
    },
  );
  return isolatedSession;
}

function isAllowedBrowserUrl(value: string, allowedHosts: Set<string>): boolean {
  try {
    const url = validateImporterUrl(value);
    return allowedHosts.has(url.hostname);
  } catch {
    return false;
  }
}

async function readRenderedHtml(window: BrowserWindow): Promise<string> {
  if (window.isDestroyed() || window.webContents.isDestroyed()) throw cancelledError();
  const result: unknown = await window.webContents.executeJavaScript(
    `(() => {
      const html = document.documentElement ? document.documentElement.outerHTML : '';
      return { length: html.length, html: html.length <= ${MAX_RENDERED_HTML_BYTES} ? html : '' };
    })()`,
    true,
  );

  if (
    !result ||
    typeof result !== 'object' ||
    typeof (result as { length?: unknown }).length !== 'number' ||
    typeof (result as { html?: unknown }).html !== 'string'
  ) {
    throw new ApplicationError('IMPORT_FAILED', 'The rendered page returned invalid content.', {
      recoverable: true,
    });
  }

  const typed = result as { length: number; html: string };
  if (typed.length > MAX_RENDERED_HTML_BYTES) {
    throw new ApplicationError(
      'IMPORT_UNSUPPORTED_PAGE',
      'The rendered page is too large to inspect safely.',
      { recoverable: true },
    );
  }
  return typed.html;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          onTimeout();
          reject(
            new ApplicationError('IMPORT_TIMEOUT', 'The rendered page took too long to load.', {
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
  return new ApplicationError('IMPORT_CANCELLED', 'The import was cancelled.', {
    recoverable: true,
  });
}
