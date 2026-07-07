import fs from 'node:fs/promises';
import path from 'node:path';

import { protocol } from 'electron';
import type { Session } from 'electron';

import { resolveApplicationAssetPath } from './application-asset-path';
import { APP_PROTOCOL } from './constants';

// Production Content-Security-Policy, served as a response header from the
// packaged `reftrack://` origin. It is stricter than the dev-oriented <meta>
// policy in index.html (no `ws://localhost:*` for HMR); when both are present
// the browser enforces the intersection. Development uses the electron-vite
// dev server, which never hits this handler, so HMR is unaffected.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "form-action 'self'",
  "connect-src 'self'",
].join('; ');

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

export function registerApplicationScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
        allowServiceWorkers: false,
      },
    },
  ]);
}

function contentTypeFor(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function response(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export function registerApplicationProtocol(session: Session, rendererRoot: string): void {
  session.protocol.handle(APP_PROTOCOL, async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return response(405, 'Method not allowed');
    }

    const filePath = resolveApplicationAssetPath(rendererRoot, request.url);
    if (!filePath) return response(403, 'Forbidden');

    try {
      const file = await fs.readFile(filePath);
      const isEntryDocument = path.basename(filePath).toLowerCase() === 'index.html';

      return new Response(request.method === 'HEAD' ? null : file, {
        status: 200,
        headers: {
          'content-type': contentTypeFor(filePath),
          'cache-control': isEntryDocument ? 'no-cache' : 'public, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff',
          'content-security-policy': CONTENT_SECURITY_POLICY,
        },
      });
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      return code === 'ENOENT' ? response(404, 'Not found') : response(500, 'Read failed');
    }
  });
}
