import { request } from 'node:https';

import { ApplicationError } from '../services/application-error';
import { extractPartnerData } from './static-extractor';
import { resolvePublicAddress, validateImporterUrl } from './network-policy';
import type { ImportProgressReporter, StaticImportResult } from './types';

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const TOTAL_TIMEOUT_MS = 20_000;
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 RefTrack/1.0';

export interface StaticImportOptions {
  signal: AbortSignal;
  reportProgress: ImportProgressReporter;
  now?: () => number;
}

interface FetchedHtml {
  html: string;
  finalUrl: string;
  redirectCount: number;
}

export async function runStaticImport(
  requestedUrl: string,
  options: StaticImportOptions,
): Promise<StaticImportResult> {
  const sourceUrl = validateImporterUrl(requestedUrl).href;
  options.reportProgress({
    stage: 'validating',
    message: 'Validating the secure destination…',
    percent: 2,
  });

  let fetched: FetchedHtml;
  try {
    fetched = await fetchHtml(sourceUrl, options);
  } catch (error: unknown) {
    if (error instanceof BrowserFallbackRequiredError) {
      return {
        brandName: '',
        sites: [],
        confidence: 0,
        warnings: [error.message],
        sourceUrl,
        finalUrl: error.finalUrl,
        redirectCount: error.redirectCount,
        requiresBrowserFallback: true,
      };
    }
    throw error;
  }
  ensureNotAborted(options.signal);

  options.reportProgress({
    stage: 'analysing',
    message: 'Analysing page structure and partner links…',
    percent: 70,
  });
  const extracted = extractPartnerData(fetched.html, fetched.finalUrl);
  const requiresBrowserFallback = extracted.sites.length === 0 || extracted.confidence < 0.55;

  return {
    ...extracted,
    sourceUrl,
    finalUrl: fetched.finalUrl,
    redirectCount: fetched.redirectCount,
    requiresBrowserFallback,
  };
}

async function fetchHtml(sourceUrl: string, options: StaticImportOptions): Promise<FetchedHtml> {
  const now = options.now ?? Date.now;
  const deadline = now() + TOTAL_TIMEOUT_MS;
  let currentUrl = sourceUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    ensureNotAborted(options.signal);
    const validated = validateImporterUrl(currentUrl);
    const remainingMs = deadline - now();
    if (remainingMs <= 0) throw timeoutError();

    options.reportProgress({
      stage: 'connecting',
      message:
        redirectCount === 0
          ? 'Connecting to the partner page…'
          : `Following secure redirect ${redirectCount} of ${MAX_REDIRECTS}…`,
      percent: Math.min(18, 5 + redirectCount * 2),
    });

    let response: RequestOnceResult;
    try {
      response = await requestOnce(validated, {
        signal: options.signal,
        timeoutMs: Math.min(REQUEST_TIMEOUT_MS, remainingMs),
        reportProgress: options.reportProgress,
      });
    } catch (error: unknown) {
      if (error instanceof BrowserFallbackRequiredError) {
        throw new BrowserFallbackRequiredError(error.message, validated.href, redirectCount);
      }
      throw error;
    }

    if (response.redirectUrl) {
      if (redirectCount >= MAX_REDIRECTS) {
        throw new ApplicationError('IMPORT_FAILED', 'The page redirected too many times.', {
          field: 'url',
          recoverable: true,
        });
      }
      currentUrl = new URL(response.redirectUrl, validated).href;
      continue;
    }

    return { html: response.html, finalUrl: validated.href, redirectCount };
  }

  throw new ApplicationError('IMPORT_FAILED', 'The page redirected too many times.', {
    field: 'url',
    recoverable: true,
  });
}

interface RequestOnceOptions {
  signal: AbortSignal;
  timeoutMs: number;
  reportProgress: ImportProgressReporter;
}

interface RequestOnceResult {
  html: string;
  redirectUrl: string | null;
}

async function requestOnce(url: URL, options: RequestOnceOptions): Promise<RequestOnceResult> {
  const resolved = await resolvePublicAddress(url.hostname);
  ensureNotAborted(options.signal);

  return new Promise<RequestOnceResult>((resolve, reject) => {
    let settled = false;
    let received = 0;
    let lastReported = 0;

    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      options.signal.removeEventListener('abort', onAbort);
      callback();
    };

    const req = request(
      {
        protocol: 'https:',
        hostname: resolved.address,
        family: resolved.family,
        port: 443,
        method: 'GET',
        path: `${url.pathname}${url.search}`,
        servername: url.hostname,
        rejectUnauthorized: true,
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9',
          'Accept-Encoding': 'identity',
          'Accept-Language': 'en-AU,en;q=0.9',
          Host: url.host,
          'User-Agent': USER_AGENT,
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status === 401 || status === 407) {
          response.resume();
          finish(() =>
            reject(
              new ApplicationError(
                'IMPORT_UNSUPPORTED_PAGE',
                'Pages requiring authentication are not supported.',
                { field: 'url', recoverable: true },
              ),
            ),
          );
          return;
        }

        if (status >= 300 && status < 400) {
          const location = response.headers.location;
          response.resume();
          if (!location) {
            finish(() =>
              reject(
                new ApplicationError('IMPORT_FAILED', 'The page returned an invalid redirect.', {
                  field: 'url',
                  recoverable: true,
                }),
              ),
            );
            return;
          }
          finish(() => resolve({ html: '', redirectUrl: location }));
          return;
        }

        if (status === 403 || status === 429 || status === 503) {
          response.resume();
          finish(() =>
            reject(
              new BrowserFallbackRequiredError(
                `Static access returned HTTP ${status}; an isolated browser fallback is required.`,
                url.href,
                0,
              ),
            ),
          );
          return;
        }

        if (status < 200 || status >= 300) {
          response.resume();
          finish(() =>
            reject(
              new ApplicationError(
                'IMPORT_FAILED',
                `The page returned HTTP status ${status || 'unknown'}.`,
                { field: 'url', recoverable: true },
              ),
            ),
          );
          return;
        }

        const contentType = String(response.headers['content-type'] ?? '').toLowerCase();
        if (!/^text\/html\b|^application\/xhtml\+xml\b/.test(contentType)) {
          response.resume();
          finish(() =>
            reject(
              new ApplicationError(
                'IMPORT_UNSUPPORTED_PAGE',
                'The URL did not return an HTML page.',
                { field: 'url', recoverable: true },
              ),
            ),
          );
          return;
        }

        const contentEncoding = String(
          response.headers['content-encoding'] ?? 'identity',
        ).toLowerCase();
        if (contentEncoding !== 'identity') {
          response.resume();
          finish(() =>
            reject(
              new BrowserFallbackRequiredError(
                'The server requires browser-managed content decoding.',
                url.href,
                0,
              ),
            ),
          );
          return;
        }

        const declaredLength = Number(response.headers['content-length'] ?? 0);
        if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
          response.resume();
          finish(() =>
            reject(
              new ApplicationError(
                'IMPORT_UNSUPPORTED_PAGE',
                'The page is too large to import safely.',
                { field: 'url', recoverable: true },
              ),
            ),
          );
          return;
        }

        options.reportProgress({
          stage: 'downloading',
          message: 'Downloading the HTML page…',
          percent: 20,
        });

        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          received += buffer.length;
          if (received > MAX_RESPONSE_BYTES) {
            response.destroy();
            finish(() =>
              reject(
                new ApplicationError(
                  'IMPORT_UNSUPPORTED_PAGE',
                  'The page exceeded the safe download limit.',
                  { field: 'url', recoverable: true },
                ),
              ),
            );
            return;
          }
          chunks.push(buffer);

          if (received - lastReported >= 64 * 1024) {
            lastReported = received;
            const ratio = declaredLength > 0 ? Math.min(1, received / declaredLength) : null;
            options.reportProgress({
              stage: 'downloading',
              message: `Downloading the HTML page… ${formatBytes(received)}`,
              percent: ratio === null ? null : Math.round(20 + ratio * 45),
            });
          }
        });
        response.once('end', () => {
          finish(() =>
            resolve({ html: Buffer.concat(chunks).toString('utf8'), redirectUrl: null }),
          );
        });
        response.once('error', (error) => {
          finish(() => reject(toNetworkError(error)));
        });
      },
    );

    const onAbort = (): void => {
      req.destroy();
      finish(() => reject(cancelledError()));
    };

    options.signal.addEventListener('abort', onAbort, { once: true });
    req.setTimeout(options.timeoutMs, () => {
      req.destroy();
      finish(() => reject(timeoutError()));
    });
    req.once('error', (error) => {
      finish(() => reject(toNetworkError(error)));
    });
    req.end();
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

function timeoutError(): ApplicationError {
  return new ApplicationError('IMPORT_TIMEOUT', 'The partner page took too long to respond.', {
    field: 'url',
    recoverable: true,
  });
}

function toNetworkError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) return error;
  return new ApplicationError('IMPORT_FAILED', 'The partner page could not be downloaded.', {
    field: 'url',
    recoverable: true,
    cause: error,
  });
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  return `${Math.round(value / 1024)} KB`;
}

class BrowserFallbackRequiredError extends Error {
  constructor(
    message: string,
    public readonly finalUrl: string,
    public readonly redirectCount: number,
  ) {
    super(message);
    this.name = 'BrowserFallbackRequiredError';
  }
}
