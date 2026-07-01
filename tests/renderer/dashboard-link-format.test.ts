import { describe, expect, it } from 'vitest';

import {
  buildReferralText,
  formatReferralDate,
  localDateKey,
} from '../../src/renderer/screens/dashboard/link-format';

const fixedDate = new Date(2026, 5, 30, 14, 5, 9);

describe('Dashboard referral text formatting', () => {
  it('preserves the approved date and time token behaviour', () => {
    expect(formatReferralDate('dd/mm hh:MM', fixedDate)).toBe('30/06 14:05');
    expect(formatReferralDate('yyyy-dd-mm hh:MM:ss', fixedDate)).toBe('2026-30-06 14:05:09');
    expect(formatReferralDate('unix', fixedDate)).toBe(
      String(Math.floor(fixedDate.getTime() / 1000)),
    );
  });

  it('builds referral text in prefix, URL, timestamp, and suffix order', () => {
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

  it('uses a local calendar date for daily state', () => {
    expect(localDateKey(fixedDate)).toBe('2026-06-30');
  });
});
