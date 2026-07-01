import path from 'node:path';

import { APP_PROTOCOL, APP_PROTOCOL_HOST } from './constants';

export function resolveApplicationAssetPath(
  rendererRoot: string,
  requestUrl: string,
): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }

  if (url.protocol !== `${APP_PROTOCOL}:` || url.hostname !== APP_PROTOCOL_HOST) {
    return null;
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  if (decodedPath.includes('\0')) return null;

  const relativePath = decodedPath.replace(/^\/+/, '') || 'index.html';
  const root = path.resolve(rendererRoot);
  const requestedPath = path.resolve(root, relativePath);
  const relativeToRoot = path.relative(root, requestedPath);

  if (
    relativeToRoot === '..' ||
    relativeToRoot.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToRoot)
  ) {
    return null;
  }

  return requestedPath;
}
