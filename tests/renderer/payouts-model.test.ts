import { describe, expect, it } from 'vitest';

import type { RendererSnapshot } from '../../src/shared/view-model/renderer-snapshot';
import { buildPayoutModel } from '../../src/renderer/screens/payouts/payouts-model';

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
        copies: 3,
        successes: 3,
        earnings: 90,
        payoutThreshold: 50,
      },
      {
        id: 'bravo',
        name: 'BRAVO',
        url: 'https://bravo.example',
        prefix: '',
        suffix: '',
        dateFormat: '',
        bonus: 20,
        maxCopiesPerDay: 1,
        copies: 1,
        successes: 1,
        earnings: 20,
      },
    ],
    dailyState: {},
    activity: [],
    lifetimeEarnings: 110,
    lifetimeSuccesses: 4,
    settings: {
      darkMode: true,
      folderClearEnabled: false,
      folderClearPath: null,
      checkinSchedule: { enabled: false, time: '09:00', lastRunDate: null },
      hotkeys: { enabled: true, bindings: [] },
    },
    tasks: { categories: [] },
    tasksDailyState: {},
    checkinDailyState: {},
    payouts: [
      {
        id: 'paid',
        siteId: 'alpha',
        amount: 30,
        expectedDate: '2026-07-01',
        paidAt: '2026-07-02T10:00:00.000Z',
        createdAt: '2026-06-30T10:00:00.000Z',
        note: '',
      },
      {
        id: 'overdue',
        siteId: 'bravo',
        amount: 20,
        expectedDate: '2026-07-10',
        paidAt: null,
        createdAt: '2026-07-01T10:00:00.000Z',
        note: 'Follow up',
      },
    ],
  };
}

describe('payout reconciliation model', () => {
  it('reconciles received money without changing recorded earnings', () => {
    const model = buildPayoutModel(snapshot(), '2026-07-15');

    expect(model).toMatchObject({
      recordedEarnings: 110,
      received: 30,
      outstanding: 80,
      pending: 20,
      overdueCount: 1,
      thresholdCount: 1,
    });
    expect(model.entries.map((entry) => [entry.id, entry.status])).toEqual([
      ['overdue', 'overdue'],
      ['paid', 'paid'],
    ]);
    expect(model.sites[0]).toMatchObject({
      site: { id: 'alpha' },
      received: 30,
      outstanding: 60,
      thresholdReached: true,
    });
  });
});
