import { describe, expect, it } from 'vitest';

import { validateImporterUrl } from '../../src/main/importer/network-policy';
import { extractPartnerData } from '../../src/main/importer/static-extractor';
import { toImporterResult } from '../../src/main/importer/types';
import {
  isBlockedPartnerUrl,
  isLikelyReferralUrl,
  partnerUrlDeduplicationKey,
} from '../../src/shared/importer/partner-url';

describe('partner URL recognition', () => {
  it('accepts public HTTPS URLs without a fixed TLD allowlist', () => {
    for (const value of [
      'https://alpha.icu/partners',
      'https://bravo.vip/partners',
      'https://charlie.bet/partners',
      'https://delta.online/partners',
      'https://echo.win/partners',
    ]) {
      expect(validateImporterUrl(value).href).toBe(value);
    }
  });

  it('recognises referral codes in paths, queries and fragments', () => {
    for (const value of [
      'https://alpha.icu/RFAA15612',
      'https://bravo.vip/join?ref=ABC123',
      'https://charlie.bet/offer/A1B2C3D4',
      'https://delta.online/#affiliate=ABC123',
    ]) {
      expect(isLikelyReferralUrl(new URL(value))).toBe(true);
    }

    expect(isLikelyReferralUrl(new URL('https://echo.win/about'))).toBe(false);
    expect(isLikelyReferralUrl(new URL('https://echo.win/assets/app.js'))).toBe(false);
  });

  it('allows registration routes when they contain a referral code', () => {
    expect(isBlockedPartnerUrl(new URL('https://alpha.vip/register'))).toBe(true);
    expect(isBlockedPartnerUrl(new URL('https://alpha.vip/register?ref=ABC123'))).toBe(false);
  });

  it('keeps different referral codes on one host while collapsing ordinary pages', () => {
    expect(partnerUrlDeduplicationKey('https://shared.win/RFALPHA123')).not.toBe(
      partnerUrlDeduplicationKey('https://shared.win/RFBRAVO456'),
    );
    expect(partnerUrlDeduplicationKey('https://shared.win/promotions')).toBe(
      partnerUrlDeduplicationKey('https://shared.win/games'),
    );
  });

  it('preserves shared-host referral codes when static and browser results are merged', () => {
    const result = toImporterResult(
      {
        brandName: 'Partner Group',
        sites: [{ name: 'Alpha', url: 'https://shared.win/RFALPHA123' }],
        confidence: 0.8,
        warnings: [],
        sourceUrl: 'https://group.online/partners',
        finalUrl: 'https://group.online/partners',
        redirectCount: 0,
        requiresBrowserFallback: true,
      },
      {
        brandName: 'Partner Group',
        sites: [{ name: 'Bravo', url: 'https://shared.win/RFBRAVO456' }],
        confidence: 0.9,
        warnings: [],
        finalUrl: 'https://group.online/partners',
      },
    );

    expect(result.sites.map((site) => site.url)).toEqual([
      'https://shared.win/RFBRAVO456',
      'https://shared.win/RFALPHA123',
    ]);
  });

  it('extracts new TLDs, same-host referral paths and referral URLs embedded in scripts', () => {
    const result = extractPartnerData(
      `
        <html>
          <head><title>Partner Group</title></head>
          <body>
            <a href="https://alpha.icu/RFAA15612">Alpha</a>
            <a href="https://bravo.vip/register?ref=RF3112A5161">Bravo</a>
            <a href="https://shared.bet/RFALPHA123">Shared Alpha</a>
            <a href="https://shared.bet/RFBRAVO456">Shared Bravo</a>
            <a href="/RFLOCAL789">Local redirect</a>
            <script>window.partnerUrl = 'https://hidden.online/A1B2C3D4';</script>
          </body>
        </html>
      `,
      'https://group.win/partners',
    );

    expect(result.sites.map((site) => site.url)).toEqual(
      expect.arrayContaining([
        'https://alpha.icu/RFAA15612',
        'https://bravo.vip/register?ref=RF3112A5161',
        'https://shared.bet/RFALPHA123',
        'https://shared.bet/RFBRAVO456',
        'https://group.win/RFLOCAL789',
        'https://hidden.online/A1B2C3D4',
      ]),
    );
  });
});
