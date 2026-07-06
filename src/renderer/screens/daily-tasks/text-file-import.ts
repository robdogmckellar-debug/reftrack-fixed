import type { ImportPartnerSite } from '../../../shared/ipc/contract';
import {
  isBlockedPartnerUrl,
  isLikelyReferralUrl,
  normalisePartnerHostname,
  partnerUrlDeduplicationKey,
} from '../../../shared/importer/partner-url';

export const MAX_PARTNER_TEXT_FILE_BYTES = 2 * 1024 * 1024;

export interface ParsedPartnerTextFile {
  fileName: string;
  categoryName: string;
  sites: ImportPartnerSite[];
  warnings: string[];
}

const MAX_RESULTS = 500;

export async function parsePartnerTextFile(file: File): Promise<ParsedPartnerTextFile> {
  if (!/\.txt$/i.test(file.name)) throw new Error('Choose a .txt file.');
  if (file.size === 0) throw new Error('The selected text file is empty.');
  if (file.size > MAX_PARTNER_TEXT_FILE_BYTES) {
    throw new Error('The selected text file is larger than the 2 MiB safety limit.');
  }

  return parsePartnerText(file.name, await file.text());
}

export function parsePartnerText(fileName: string, source: string): ParsedPartnerTextFile {
  const text = source.replace(/^\uFEFF/, '');
  const warnings: string[] = [];
  const candidates: ImportPartnerSite[] = [];

  if (looksLikeHtml(text)) {
    const document = new DOMParser().parseFromString(text, 'text/html');
    const baseUrl = safeBaseUrl(document.querySelector('base[href]')?.getAttribute('href') ?? null);
    let ignoredRelativeLinks = 0;

    for (const anchor of Array.from(document.querySelectorAll('a[href]'))) {
      const href = anchor.getAttribute('href')?.trim();
      if (!href) continue;
      if (!baseUrl && !/^https:\/\//i.test(href)) {
        ignoredRelativeLinks += 1;
        continue;
      }

      const imageName = anchor.querySelector('img[alt]')?.getAttribute('alt') ?? '';
      const name = cleanName(anchor.textContent ?? '') || cleanName(imageName);
      addCandidate(candidates, name, href, baseUrl ?? undefined);
    }

    if (ignoredRelativeLinks > 0) {
      warnings.push(
        `${ignoredRelativeLinks} relative link${ignoredRelativeLinks === 1 ? ' was' : 's were'} ignored because the text file did not provide a secure base URL.`,
      );
    }
  } else {
    for (const line of text.split(/\r?\n/)) {
      const matches = Array.from(line.matchAll(/https:\/\/[^\s<>"'`]+/gi));
      for (const match of matches) {
        const rawUrl = trimUrlPunctuation(match[0]);
        const prefix = line.slice(0, match.index ?? 0);
        const suffix = line.slice((match.index ?? 0) + match[0].length);
        const suppliedName = cleanDelimitedName(prefix) || cleanDelimitedName(suffix);
        addCandidate(candidates, suppliedName, rawUrl);
      }
    }
  }

  const sites = deduplicateCandidates(candidates).slice(0, MAX_RESULTS);
  if (candidates.length > MAX_RESULTS) {
    warnings.push(`Only the first ${MAX_RESULTS} distinct partner links were retained.`);
  }
  if (sites.length === 0) {
    throw new Error('No credential-free HTTPS partner links were found in the text file.');
  }

  return {
    fileName,
    categoryName: categoryNameFromFile(fileName),
    sites,
    warnings,
  };
}

function looksLikeHtml(value: string): boolean {
  return /<(?:!doctype\s+html|html|head|body|a)\b/i.test(value);
}

function safeBaseUrl(value: string | null): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function addCandidate(
  candidates: ImportPartnerSite[],
  suppliedName: string,
  href: string,
  baseUrl?: URL,
): void {
  let url: URL;
  try {
    url = new URL(href, baseUrl);
  } catch {
    return;
  }

  if (url.protocol !== 'https:' || url.username || url.password || isBlockedPartnerUrl(url)) {
    return;
  }

  if (!isLikelyReferralUrl(url)) url.hash = '';
  const name = cleanName(suppliedName) || nameFromHostname(url.hostname);
  if (!name || name.length > 100 || url.href.length > 2048) return;
  candidates.push({ name, url: url.href });
}

function deduplicateCandidates(candidates: readonly ImportPartnerSite[]): ImportPartnerSite[] {
  const unique = new Map<string, ImportPartnerSite>();
  for (const candidate of candidates) {
    const key = partnerUrlDeduplicationKey(candidate.url);
    if (key && !unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function cleanDelimitedName(value: string): string {
  return cleanName(
    value
      .replace(/^[\s|,;:\-–—>]+|[\s|,;:\-–—<]+$/g, '')
      .replace(/^(?:name|site|partner|brand|url|link)\s*[:=-]?\s*/i, ''),
  );
}

function trimUrlPunctuation(value: string): string {
  return value.replace(/[),.;\]}]+$/g, '');
}

function cleanName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 100);
}

function categoryNameFromFile(fileName: string): string {
  const name = cleanName(fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
  return name || 'Imported Partners';
}

function nameFromHostname(hostname: string): string {
  const label = normalisePartnerHostname(hostname).split('.')[0] ?? '';
  return label
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}
