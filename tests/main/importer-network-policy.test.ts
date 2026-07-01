import { describe, expect, it } from 'vitest';

import {
  isDisallowedHostname,
  isPublicIpAddress,
  validateImporterUrl,
} from '../../src/main/importer/network-policy';

describe('partner importer network policy', () => {
  it('allows only credential-free standard-port HTTPS URLs', () => {
    expect(validateImporterUrl('https://example.com/partners#section').href).toBe(
      'https://example.com/partners',
    );
    expect(() => validateImporterUrl('http://example.com')).toThrow(/HTTPS/);
    expect(() => validateImporterUrl('https://user:pass@example.com')).toThrow(/HTTPS/);
    expect(() => validateImporterUrl('https://example.com:8443')).toThrow(/standard HTTPS port/);
  });

  it('rejects local and reserved hostnames', () => {
    for (const host of ['localhost', 'service.local', 'router.lan', 'app.internal']) {
      expect(isDisallowedHostname(host)).toBe(true);
      expect(() => validateImporterUrl(`https://${host}/partners`)).toThrow(
        /Local|private|reserved/,
      );
    }
  });

  it('distinguishes public addresses from private and reserved ranges', () => {
    expect(isPublicIpAddress('8.8.8.8')).toBe(true);
    expect(isPublicIpAddress('1.1.1.1')).toBe(true);
    expect(isPublicIpAddress('10.0.0.1')).toBe(false);
    expect(isPublicIpAddress('127.0.0.1')).toBe(false);
    expect(isPublicIpAddress('169.254.10.2')).toBe(false);
    expect(isPublicIpAddress('192.168.1.1')).toBe(false);
    expect(isPublicIpAddress('203.0.113.10')).toBe(false);
    expect(isPublicIpAddress('2001:4860:4860::8888')).toBe(true);
    expect(isPublicIpAddress('::1')).toBe(false);
    expect(isPublicIpAddress('fc00::1')).toBe(false);
    expect(isPublicIpAddress('2001:db8::1')).toBe(false);
  });
});
