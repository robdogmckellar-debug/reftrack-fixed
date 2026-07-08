import { describe, expect, it } from 'vitest';

import { deriveCheckinUrls } from '../../src/shared/checkin/checkin-url';

const DEFAULTS = { loginPath: '/login', checkinPath: '/daily-checkin' };

describe('deriveCheckinUrls', () => {
  it('derives login and check-in URLs from a site origin', () => {
    const result = deriveCheckinUrls('https://u2win.online/RFAA15612', DEFAULTS);
    expect(result).toEqual({
      origin: 'https://u2win.online',
      hostname: 'u2win.online',
      loginUrl: 'https://u2win.online/login',
      checkinUrl: 'https://u2win.online/daily-checkin',
    });
  });

  it('applies per-site path overrides', () => {
    const result = deriveCheckinUrls('https://galaxyau.com/ref', DEFAULTS, {
      loginPath: '/signin',
      checkinPath: '/rewards/checkin',
    });
    expect(result?.loginUrl).toBe('https://galaxyau.com/signin');
    expect(result?.checkinUrl).toBe('https://galaxyau.com/rewards/checkin');
  });

  it('normalises paths that are missing a leading slash', () => {
    const result = deriveCheckinUrls('https://example.com', {
      loginPath: 'login',
      checkinPath: 'checkin',
    });
    expect(result?.loginUrl).toBe('https://example.com/login');
    expect(result?.checkinUrl).toBe('https://example.com/checkin');
  });

  it('rejects non-HTTPS, credentialed, empty and invalid URLs', () => {
    expect(deriveCheckinUrls('http://example.com', DEFAULTS)).toBeNull();
    expect(deriveCheckinUrls('https://user:pass@example.com', DEFAULTS)).toBeNull();
    expect(deriveCheckinUrls('', DEFAULTS)).toBeNull();
    expect(deriveCheckinUrls('not-a-url', DEFAULTS)).toBeNull();
  });
});
