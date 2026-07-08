export interface CheckinPathDefaults {
  loginPath: string;
  checkinPath: string;
}

export interface CheckinPathOverride {
  loginPath?: string;
  checkinPath?: string;
}

export interface CheckinTargetUrls {
  origin: string;
  hostname: string;
  loginUrl: string;
  checkinUrl: string;
}

/**
 * Derives the login and daily check-in URLs for a site from its base URL. Both
 * targets share the site's origin; the paths come from the shared defaults
 * unless a per-site override is supplied. Returns `null` for URLs that are not
 * credential-free HTTPS, matching the rest of RefTrack's URL policy.
 */
export function deriveCheckinUrls(
  siteUrl: string,
  defaults: CheckinPathDefaults,
  override?: CheckinPathOverride,
): CheckinTargetUrls | null {
  const trimmed = siteUrl.trim();
  if (!trimmed) return null;

  let base: URL;
  try {
    base = new URL(trimmed);
  } catch {
    return null;
  }

  if (base.protocol !== 'https:' || base.username || base.password) return null;

  const loginPath = normalisePath(override?.loginPath, defaults.loginPath);
  const checkinPath = normalisePath(override?.checkinPath, defaults.checkinPath);

  let loginUrl: URL;
  let checkinUrl: URL;
  try {
    loginUrl = new URL(loginPath, base.origin);
    checkinUrl = new URL(checkinPath, base.origin);
  } catch {
    return null;
  }

  if (loginUrl.origin !== base.origin || checkinUrl.origin !== base.origin) return null;

  return {
    origin: base.origin,
    hostname: base.hostname,
    loginUrl: loginUrl.href,
    checkinUrl: checkinUrl.href,
  };
}

function normalisePath(override: string | undefined, fallback: string): string {
  const value = (override ?? '').trim() || fallback.trim();
  if (!value) return '/';
  return value.startsWith('/') ? value : `/${value}`;
}
