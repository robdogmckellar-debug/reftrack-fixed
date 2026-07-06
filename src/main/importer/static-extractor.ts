import { parse, type DefaultTreeAdapterTypes } from 'parse5';

import type { ImportPartnerSite } from '../../shared/ipc/contract';
import {
  isBlockedPartnerUrl,
  isLikelyReferralUrl,
  normalisePartnerHostname,
  partnerUrlDeduplicationKey,
} from '../../shared/importer/partner-url';

interface ExtractedPartnerData {
  brandName: string;
  sites: ImportPartnerSite[];
  confidence: number;
  warnings: string[];
}

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

const NAME_BLOCKLIST =
  /^(?:privacy|terms|login|register|sign in|sign up|contact|about|blog|news|faq|help|support|cookie|policy|sitemap|home|back|menu|navigation|search|facebook|twitter|instagram|linkedin|youtube)$/i;
const PARTNER_SIGNAL = /(?:partner|casino|brand|operator|site|affiliate|network|portfolio|frame)/i;
const MAX_RESULTS = 500;

export function extractPartnerData(html: string, pageUrl: string): ExtractedPartnerData {
  const document = parse(html);
  const elements = collectElements(document);
  const page = new URL(pageUrl);
  const pageHostname = normalisePartnerHostname(page.hostname);
  const warnings: string[] = [];

  const title = textOf(firstByTag(elements, 'title'));
  const heading = textOf(firstByTag(elements, 'h1'));
  const openGraphTitle = attribute(
    elements.find(
      (element) =>
        element.tagName === 'meta' && attribute(element, 'property')?.toLowerCase() === 'og:title',
    ),
    'content',
  );
  const brandName = cleanBrandName(
    heading || openGraphTitle || title || nameFromHostname(pageHostname),
  );

  const candidates: Candidate[] = [];
  let partnerSignals = 0;

  for (const element of elements) {
    if (element.tagName === 'script' && attribute(element, 'type') === 'application/ld+json') {
      collectStructuredData(textOf(element), page, candidates);
      continue;
    }

    if (element.tagName !== 'a') continue;
    const href = attribute(element, 'href');
    if (!href) continue;
    const className = attribute(element, 'class') ?? '';
    if (PARTNER_SIGNAL.test(className)) partnerSignals += 1;

    const visibleName = cleanSiteName(textOf(element));
    const imageAlt = cleanSiteName(
      attribute(
        findDescendant(element, (child) => child.tagName === 'img'),
        'alt',
      ) ?? '',
    );
    addCandidate(candidates, page, pageHostname, visibleName || imageAlt, href, className);
  }

  collectEmbeddedReferralUrls(html, page, pageHostname, candidates);

  const sites = deduplicateCandidates(candidates).slice(0, MAX_RESULTS);
  if (candidates.length > MAX_RESULTS) {
    warnings.push(`Only the first ${MAX_RESULTS} distinct partner links were retained.`);
  }

  const scriptCount = elements.filter((element) => element.tagName === 'script').length;
  const anchorCount = elements.filter((element) => element.tagName === 'a').length;
  let confidence = 0;
  if (brandName) confidence += 0.15;
  confidence += Math.min(0.65, sites.length * 0.13);
  if (partnerSignals > 0) confidence += 0.12;
  if (sites.some((site) => isLikelyReferralUrl(new URL(site.url)))) confidence += 0.08;
  confidence = roundConfidence(Math.min(1, confidence));

  if (sites.length === 0 && scriptCount > 3) {
    warnings.push('The static page contained scripts but no usable partner links.');
  } else if (sites.length === 1 && anchorCount > 10) {
    warnings.push('Only one partner link was identified with confidence.');
  }

  return { brandName, sites, confidence, warnings };
}

interface Candidate extends ImportPartnerSite {
  score: number;
}

function collectStructuredData(jsonText: string, page: URL, candidates: Candidate[]): void {
  if (!jsonText.trim() || jsonText.length > 500_000) return;
  try {
    const value: unknown = JSON.parse(jsonText);
    visitStructuredValue(value, (name, url) => {
      addCandidate(
        candidates,
        page,
        normalisePartnerHostname(page.hostname),
        name,
        url,
        'structured-data',
      );
    });
  } catch {
    // Invalid third-party structured data is ignored.
  }
}

function collectEmbeddedReferralUrls(
  html: string,
  page: URL,
  pageHostname: string,
  candidates: Candidate[],
): void {
  const matches = html.matchAll(/https:(?:\/\/|\\\/\\\/)[^\s"'<>]+/gi);
  for (const match of matches) {
    const href = trimEmbeddedUrl(match[0]);
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      continue;
    }
    if (!isLikelyReferralUrl(url)) continue;
    addCandidate(
      candidates,
      page,
      pageHostname,
      nameFromHostname(url.hostname),
      href,
      'embedded-referral-url',
    );
  }
}

function visitStructuredValue(
  value: unknown,
  add: (name: string, url: string) => void,
  depth = 0,
): void {
  if (depth > 8 || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 1000)) visitStructuredValue(item, add, depth + 1);
    return;
  }

  const record = value as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name : '';
  const url = typeof record.url === 'string' ? record.url : '';
  if (name && url) add(name, url);

  for (const child of Object.values(record)) visitStructuredValue(child, add, depth + 1);
}

function addCandidate(
  candidates: Candidate[],
  page: URL,
  pageHostname: string,
  suppliedName: string,
  href: string,
  context: string,
): void {
  let url: URL;
  try {
    url = new URL(href, page);
  } catch {
    return;
  }

  if (url.protocol !== 'https:' || url.username || url.password) return;
  const referralLike = isLikelyReferralUrl(url);
  const hostname = normalisePartnerHostname(url.hostname);
  if (!hostname || isBlockedPartnerUrl(url)) return;
  if (sameDocument(url, page)) return;
  if (hostname === pageHostname && !referralLike) return;
  if (!referralLike) url.hash = '';

  let name = cleanSiteName(suppliedName);
  if (!name || NAME_BLOCKLIST.test(name)) name = nameFromHostname(hostname);
  if (!name || name.length < 2 || name.length > 100) return;

  let score = 10;
  score += Math.min(30, url.pathname.length + url.search.length + url.hash.length);
  if (referralLike) score += 45;
  if (PARTNER_SIGNAL.test(context)) score += 15;
  if (suppliedName) score += 10;

  candidates.push({ name, url: url.href, score });
}

function deduplicateCandidates(candidates: Candidate[]): ImportPartnerSite[] {
  const byKey = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const key = partnerUrlDeduplicationKey(candidate.url);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing || candidate.score > existing.score) byKey.set(key, candidate);
  }
  return [...byKey.values()]
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
    .map(({ name, url }) => ({ name, url }));
}

function sameDocument(candidate: URL, page: URL): boolean {
  const left = new URL(candidate.href);
  const right = new URL(page.href);
  left.hash = '';
  right.hash = '';
  return left.href === right.href;
}

function trimEmbeddedUrl(value: string): string {
  return value
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')
    .replace(/[),.;\]}]+$/g, '');
}

function collectElements(root: Node): Element[] {
  const output: Element[] = [];
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if ('tagName' in node) output.push(node);
    if ('childNodes' in node) {
      for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
        const child = node.childNodes[index];
        if (child) stack.push(child);
      }
    }
  }
  return output;
}

function firstByTag(elements: Element[], tagName: string): Element | undefined {
  return elements.find((element) => element.tagName === tagName);
}

function findDescendant(
  element: Element,
  predicate: (element: Element) => boolean,
): Element | undefined {
  const stack: Node[] = [...element.childNodes];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if ('tagName' in node && predicate(node)) return node;
    if ('childNodes' in node) stack.push(...node.childNodes);
  }
  return undefined;
}

function attribute(element: Element | undefined, name: string): string | undefined {
  return element?.attrs.find((attributeEntry) => attributeEntry.name === name)?.value;
}

function textOf(node: Node | undefined): string {
  if (!node) return '';
  if ('value' in node && typeof node.value === 'string') return node.value;
  if (!('childNodes' in node)) return '';
  return node.childNodes.map((child) => textOf(child)).join(' ');
}

function cleanBrandName(value: string): string {
  return cleanWhitespace(value)
    .replace(/\s*[-|–—:]\s*.*$/, '')
    .slice(0, 100);
}

function cleanSiteName(value: string): string {
  return cleanWhitespace(value)
    .replace(/^[|·•\-–—]+|[|·•\-–—]+$/g, '')
    .slice(0, 100);
}

function cleanWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function nameFromHostname(hostname: string): string {
  const firstLabel = normalisePartnerHostname(hostname).split('.')[0] ?? '';
  return firstLabel
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}
