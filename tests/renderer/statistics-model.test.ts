import { describe, expect, it } from 'vitest';

import type { RendererSnapshot } from '../../src/shared/view-model/renderer-snapshot';
import {
  buildDayDrilldown,
  buildLeaderboard,
  buildMonthDrilldown,
  buildYearStatistics,
  getDateKeysForMonth,
  getDayTotals,
  getMonthTotals,
  getSiteTotalsForKeys,
  getYearTotals,
} from '../../src/renderer/screens/statistics/statistics-model';

function snapshot(): RendererSnapshot {
  return {
    revision: 1,
    sites: [
      {
        id: 'alpha',
        name: 'ALPHA',
        url: 'https://alpha.example',
        prefix: '',
        suffix: '',
        dateFormat: '',
        bonus: 30,
        maxCopiesPerDay: 1,
        copies: 0,
        successes: 0,
        earnings: 0,
      },
      {
        id: 'beta',
        name: 'BETA',
        url: 'https://beta.example',
        prefix: '',
        suffix: '',
        dateFormat: '',
        bonus: 20,
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
    lifetimeEarnings: 150,
    lifetimeSuccesses: 6,
    settings: { darkMode: true, folderClearEnabled: false, folderClearPath: null },
    tasks: { categories: [] },
    tasksDailyState: {},
  };
}

describe('statistics model', () => {
  it('aggregates day, month, year, and stable site totals', () => {
    const state = snapshot();
    expect(getDayTotals(state, '2026-06-30')).toEqual({
      earnings: 80,
      successes: 3,
      copies: 5,
    });
    expect(getMonthTotals(state, 2026, 5)).toEqual({
      earnings: 110,
      successes: 4,
      copies: 8,
    });
    expect(getYearTotals(state, 2026)).toEqual({
      earnings: 140,
      successes: 5,
      copies: 9,
    });
    expect(getSiteTotalsForKeys(state, ['2026-06-01', '2026-06-30'])).toEqual([
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

  it('returns all valid leap-year February keys', () => {
    const keys = getDateKeysForMonth(2024, 1);
    expect(keys).toHaveLength(29);
    expect(keys[0]).toBe('2024-02-01');
    expect(keys.at(-1)).toBe('2024-02-29');
  });

  it('builds deterministic top-three rankings for each metric', () => {
    const state = snapshot();
    const copies = buildLeaderboard(state, 'copies', 'alltime', new Date(2026, 5, 30));
    const successes = buildLeaderboard(state, 'successes', 'alltime', new Date(2026, 5, 30));

    expect(copies.map((entry) => [entry.name, entry.value, entry.rank])).toEqual([
      ['ALPHA', 5, 1],
      ['BETA', 4, 2],
      ['removedSite', 1, 3],
    ]);
    expect(successes.map((entry) => [entry.name, entry.value])).toEqual([
      ['ALPHA', 3],
      ['BETA', 2],
      ['removedSite', 1],
    ]);
    expect(copies[0]?.percentage).toBe(100);
  });

  it('builds year, month-week, and day drill-down models without mutating state', () => {
    const state = snapshot();
    const original = structuredClone(state);
    const year = buildYearStatistics(state, 2026);
    const month = buildMonthDrilldown(state, 2026, 5, new Date(2026, 5, 30));
    const day = buildDayDrilldown(state, '2026-06-30');

    expect(year.months).toHaveLength(12);
    expect(year.months[5]?.name).toBe('June');
    expect(year.months[5]?.totals.earnings).toBe(110);
    expect(month.weeks.length).toBeGreaterThanOrEqual(4);
    expect(month.weeks.flatMap((week) => week.days).some((item) => item.today)).toBe(true);
    expect(month.topSites.map((site) => site.name)).toEqual(['BETA', 'ALPHA', 'removedSite']);
    expect(day?.label).toContain('30 June 2026');
    expect(day?.sites.map((site) => site.name)).toEqual(['BETA', 'removedSite', 'ALPHA']);
    expect(state).toEqual(original);
  });
});
