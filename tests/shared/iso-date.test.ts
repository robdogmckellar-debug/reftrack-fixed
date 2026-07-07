import { describe, expect, it } from 'vitest';

import { isValidIsoDate, isValidIsoTimestamp } from '../../src/shared/date/iso-date';

describe('isValidIsoDate', () => {
  it('accepts real calendar dates and rejects malformed or impossible ones', () => {
    expect(isValidIsoDate('2026-07-07')).toBe(true);
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-7-7')).toBe(false);
    expect(isValidIsoDate('not-a-date')).toBe(false);
  });
});

describe('isValidIsoTimestamp', () => {
  it('accepts the ISO-8601 form produced by toISOString and offset variants', () => {
    expect(isValidIsoTimestamp(new Date('2026-07-07T12:00:00.000Z').toISOString())).toBe(true);
    expect(isValidIsoTimestamp('2026-07-07T12:00:00Z')).toBe(true);
    expect(isValidIsoTimestamp('2026-07-07T12:00:00+10:00')).toBe(true);
  });

  it('rejects lenient/non-ISO strings that Date.parse would otherwise accept', () => {
    expect(isValidIsoTimestamp('2026/07/07 12:00')).toBe(false);
    expect(isValidIsoTimestamp('July 7, 2026')).toBe(false);
    expect(isValidIsoTimestamp('2026-07-07')).toBe(false);
    expect(isValidIsoTimestamp('2026-13-01T00:00:00Z')).toBe(false);
  });
});
