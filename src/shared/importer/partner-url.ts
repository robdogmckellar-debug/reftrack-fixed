const REFERRAL_QUERY_KEY =
  /^(?:ref(?:erral)?|refer(?:rer)?|affiliate|aff(?:iliate)?(?:id)?|promo(?:code)?|code|invite|partner|campaign|clickid|subid|tracking|track|tag)$/i;
const KNOWN_CODE_PREFIX = /^(?:rf|ref|aff|promo|invite|code)[-_]?[a-z0-9]{3,64}$/i;
const OPAQUE_CODE = /^[a-z0-9][a-z0-9_-]{5,63}$/i;
const NON_CODE_FILE =
  /\.(?:html?|php|aspx?|jsp|json|xml|css|m?js|cjs|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|pdf)$/i;
const BLOCKED_HOST =
  /(?:^|\.)(?:facebook\.com|twitter\.com|x\.com|instagram\.com|linkedin\.com|youtube\.com|youtu\.be|tiktok\.com|discord\.com|discord\.gg)$/i;
const NON_PARTNER_ROUTE =
  /(?:^|[/?&_.-])(?:privacy|terms|contact|about|blog|news|faq|help|support|cookie|policy|sitemap)(?:[/?&=_.-]|$)/i;
const AUTH_ROUTE =
  /(?:^|[/?&_.-])(?:login|log-in|register|sign-in|sign-up)(?:[/?&=_.-]|$)/i;
const COMMON_SEGMENTS = new Set([
  'about',
  'account',
  'blog',
  'contact',
  'faq',
  'help',
  'home',
  'index',
  'login',
  'news',
  'privacy',
  'register',
  'search',
  'signin',
  'signup',
  'support',
  'terms',
]);

export function normalisePartnerHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

export function isLikelyReferralUrl(url: URL): boolean {
  for (const [key, value] of url.searchParams) {
    if (value && REFERRAL_QUERY_KEY.test(key)) return true;
    if (value && KNOWN_CODE_PREFIX.test(value)) return true;
  }

  const hash = url.hash.replace(/^#/, '');
  if (hash) {
    if (KNOWN_CODE_PREFIX.test(hash)) return true;
    const hashParams = new URLSearchParams(hash);
    for (const [key, value] of hashParams) {
      if (value && REFERRAL_QUERY_KEY.test(key)) return true;
      if (value && KNOWN_CODE_PREFIX.test(value)) return true;
    }
  }

  const segments = url.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponentSafely(segment));
  const finalSegment = segments.at(-1) ?? '';
  if (!finalSegment || COMMON_SEGMENTS.has(finalSegment.toLowerCase())) return false;
  if (NON_CODE_FILE.test(finalSegment)) return false;
  if (KNOWN_CODE_PREFIX.test(finalSegment)) return true;

  return OPAQUE_CODE.test(finalSegment) && /[a-z]/i.test(finalSegment) && /\d/.test(finalSegment);
}

export function isBlockedPartnerUrl(url: URL): boolean {
  const hostname = normalisePartnerHostname(url.hostname);
  if (BLOCKED_HOST.test(hostname)) return true;

  const route = `${url.pathname}${url.search}${url.hash}`;
  if (NON_PARTNER_ROUTE.test(route)) return true;
  return AUTH_ROUTE.test(route) && !isLikelyReferralUrl(url);
}

export function partnerUrlDeduplicationKey(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const hostname = normalisePartnerHostname(url.hostname);
  if (!hostname) return null;
  if (!isLikelyReferralUrl(url)) return `host:${hostname}`;

  const canonical = new URL(url.href);
  canonical.hostname = hostname;
  canonical.searchParams.sort();
  if (canonical.pathname.length > 1) canonical.pathname = canonical.pathname.replace(/\/$/, '');
  return `referral:${canonical.origin}${canonical.pathname}${canonical.search}${canonical.hash}`;
}

function decodeURIComponentSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
