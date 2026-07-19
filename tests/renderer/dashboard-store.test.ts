import { afterEach, describe, expect, it } from 'vitest';

import type { RendererSnapshot } from '../../src/shared/view-model/renderer-snapshot';
import {
  dashboardFilter,
  dashboardSummary,
  dailySignalFor,
  resetDashboardStore,
  siteSignalFor,
  synchroniseDashboard,
  visibleDashboardSiteIds,
} from '../../src/renderer/screens/dashboard/dashboard-store';

function createSnapshot(overrides: Partial<RendererSnapshot> = {}): RendererSnapshot {
  return {
    revision: 1,
    sites: [
      {
        id: 'site-a',
        name: 'Alpha',
        url: 'https://alpha.example/',
        prefix: '',
        suffix: '',
        dateFormat: '',
        bonus: 30,
        maxCopiesPerDay: 1,
        copies: 3,
        successes: 1,
        earnings: 30,
      },
      {
        id: 'site-b',
        name: 'Bravo',
        url: 'https://bravo.example/',
        prefix: '',
        suffix: '',
        dateFormat: '',
        bonus: 20,
        maxCopiesPerDay: 2,
        copies: 2,
        successes: 0,
        earnings: 0,
      },
    ],
    dailyState: {
      '2026-06-30': {
        'site-a': { copies: 1, successes: 1, earnings: 30 },
        'site-b': { copies: 1, successes: 0, earnings: 0 },
      },
    },
    activity: [],
    lifetimeEarnings: 30,
    lifetimeSuccesses: 1,
    settings: {
      darkMode: true,
      folderClearEnabled: false,
      folderClearPath: null,
    },
    tasks: { categories: [] },
    tasksDailyState: {},
    ...overrides,
  };
}

afterEach(() => resetDashboardStore());

describe('Dashboard Signals store', () => {
  it('derives summary metrics and completion filters from one snapshot', () => {
    synchroniseDashboard(createSnapshot(), '2026-06-30');

    expect(dashboardSummary.value).toEqual({
      todayEarnings: 30,
      todaySuccesses: 1,
      todayCopies: 2,
      lifetimeEarnings: 30,
      lifetimeSuccesses: 1,
    });

    dashboardFilter.value = 'done';
    expect(visibleDashboardSiteIds.value).toEqual(['site-a']);

    dashboardFilter.value = 'pending';
    expect(visibleDashboardSiteIds.value).toEqual(['site-b']);
  });

  it('updates only the changed site and daily signals during reconciliation', () => {
    synchroniseDashboard(createSnapshot(), '2026-06-30');
    const alpha = siteSignalFor('site-a');
    const bravo = siteSignalFor('site-b');
    const alphaDaily = dailySignalFor('site-a');
    const bravoDaily = dailySignalFor('site-b');

    const alphaValues: number[] = [];
    const bravoValues: number[] = [];
    const alphaDailyValues: number[] = [];
    const bravoDailyValues: number[] = [];
    const removeAlpha = alpha.subscribe((site) => alphaValues.push(site?.copies ?? -1));
    const removeBravo = bravo.subscribe((site) => bravoValues.push(site?.copies ?? -1));
    const removeAlphaDaily = alphaDaily.subscribe((metrics) =>
      alphaDailyValues.push(metrics.copies),
    );
    const removeBravoDaily = bravoDaily.subscribe((metrics) =>
      bravoDailyValues.push(metrics.copies),
    );

    const updated = createSnapshot({ revision: 2 });
    updated.sites = updated.sites.map((site) =>
      site.id === 'site-a' ? { ...site, copies: 4 } : site,
    );
    updated.dailyState = {
      '2026-06-30': {
        ...updated.dailyState['2026-06-30'],
        'site-a': { copies: 2, successes: 1, earnings: 30 },
      },
    };
    synchroniseDashboard(updated, '2026-06-30');

    expect(alphaValues).toEqual([3, 4]);
    expect(bravoValues).toEqual([2]);
    expect(alphaDailyValues).toEqual([1, 2]);
    expect(bravoDailyValues).toEqual([1]);

    removeAlpha();
    removeBravo();
    removeAlphaDaily();
    removeBravoDaily();
  });

  it('keeps archived and recycled sites out of active dashboard workflows', () => {
    const snapshot = createSnapshot();
    snapshot.sites = [
      snapshot.sites[0]!,
      { ...snapshot.sites[1]!, lifecycle: 'archived' },
      {
        ...snapshot.sites[1]!,
        id: 'site-c',
        name: 'Charlie',
        lifecycle: 'trashed',
      },
    ];

    synchroniseDashboard(snapshot, '2026-06-30');

    expect(visibleDashboardSiteIds.value).toEqual(['site-a']);
    expect(siteSignalFor('site-b').value).toBeNull();
    expect(siteSignalFor('site-c').value).toBeNull();
  });
});
