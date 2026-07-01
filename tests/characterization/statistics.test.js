import { describe, expect, it } from 'vitest';

import {
  getDateKeysForMonth,
  getDayTotals,
  getMonthTotals,
  getSiteTotalsForKeys,
  getYearTotals,
} from '../../src/renderer/screens/statistics/statistics-model';

const appData = {
  revision: 1,
  sites: [
    {
      id: 'alpha',
      name: 'ALPHA',
      url: '',
      prefix: '',
      suffix: '',
      dateFormat: '',
      bonus: 0,
      maxCopiesPerDay: 1,
      copies: 0,
      successes: 0,
      earnings: 0,
    },
    {
      id: 'beta',
      name: 'BETA',
      url: '',
      prefix: '',
      suffix: '',
      dateFormat: '',
      bonus: 0,
      maxCopiesPerDay: 1,
      copies: 0,
      successes: 0,
      earnings: 0,
    },
  ],
  dailyState: {
    '2025-12-31': {
      alpha: { copies: 1, successes: 1, earnings: 10 },
    },
    '2026-06-01': {
      alpha: { copies: 2, successes: 1, earnings: 30 },
      beta: { copies: 1, successes: 0, earnings: 0 },
    },
    '2026-06-30': {
      alpha: { copies: 1, successes: 0, earnings: 0 },
      beta: { copies: 3, successes: 2, earnings: 60 },
      removedSite: { copies: 1, successes: 1, earnings: 20 },
    },
    '2026-07-01': {
      alpha: { copies: 1, successes: 1, earnings: 30 },
    },
  },
  activity: [],
  lifetimeEarnings: 0,
  lifetimeSuccesses: 0,
  settings: { darkMode: true, folderClearEnabled: false, folderClearPath: null },
  tasks: { categories: [] },
  tasksDailyState: {},
};

describe('statistics aggregation', () => {
  it('adds copies, successes and earnings for one day', () => {
    expect(getDayTotals(appData, '2026-06-30')).toEqual({
      earnings: 80,
      successes: 3,
      copies: 5,
    });
  });

  it('aggregates the complete selected month', () => {
    expect(getMonthTotals(appData, 2026, 5)).toEqual({
      earnings: 110,
      successes: 4,
      copies: 8,
    });
  });

  it('aggregates every month in the selected year', () => {
    expect(getYearTotals(appData, 2026)).toEqual({
      earnings: 140,
      successes: 5,
      copies: 9,
    });
  });

  it('groups leaderboard totals by stable site ID', () => {
    expect(getSiteTotalsForKeys(appData, ['2026-06-01', '2026-06-30'])).toEqual([
      { siteId: 'alpha', name: 'ALPHA', earnings: 30, successes: 1, copies: 3 },
      { siteId: 'beta', name: 'BETA', earnings: 60, successes: 2, copies: 4 },
      {
        siteId: 'removedSite',
        name: 'removedSite',
        earnings: 20,
        successes: 1,
        copies: 1,
      },
    ]);
  });

  it('returns every valid date key for leap-year February', () => {
    const keys = getDateKeysForMonth(2024, 1);
    expect(keys).toHaveLength(29);
    expect(keys[0]).toBe('2024-02-01');
    expect(keys.at(-1)).toBe('2024-02-29');
  });
});
