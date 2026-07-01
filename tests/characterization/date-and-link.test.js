import { describe, expect, it } from 'vitest';

import {
  buildReferralText,
  formatReferralDate,
  localDateKey,
} from '../../src/renderer/screens/dashboard/link-format';

const fixedDate = new Date(2026, 5, 30, 14, 5, 9);

describe('typed referral-link formatting', () => {
  it('formats the standard day/month timestamp', () => {
    expect(formatReferralDate('dd/mm hh:MM', fixedDate)).toBe('30/06 14:05');
  });

  it('preserves the existing year-day-month timestamp format', () => {
    expect(formatReferralDate('yyyy-dd-mm hh:MM:ss', fixedDate)).toBe('2026-30-06 14:05:09');
  });

  it('formats Unix time in whole seconds', () => {
    expect(formatReferralDate('unix', fixedDate)).toBe(
      String(Math.floor(fixedDate.getTime() / 1000)),
    );
  });

  it('builds copied text in prefix, URL, date and suffix order', () => {
    expect(
      buildReferralText(
        {
          prefix: 'Join now',
          url: 'https://example.test/ref',
          dateFormat: 'dd/mm hh:MM',
          suffix: '🕒',
        },
        fixedDate,
      ),
    ).toBe('Join now https://example.test/ref 30/06 14:05 🕒');
  });

  it('omits empty link segments without adding extra spaces', () => {
    expect(
      buildReferralText(
        { prefix: '', url: 'https://example.test/ref', dateFormat: '', suffix: '' },
        fixedDate,
      ),
    ).toBe('https://example.test/ref');
  });

  it('uses a local yyyy-mm-dd key for daily state', () => {
    expect(localDateKey(fixedDate)).toBe('2026-06-30');
  });
});
