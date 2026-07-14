import { describe, expect, it } from 'vitest';

import { createDefaultAppState } from '../../src/domain/defaults';
import { toRendererSnapshot } from '../../src/main/view-model/renderer-snapshot-adapter';

describe('renderer snapshot adapter', () => {
  it('converts integer currency to dollars and retains historical records without pruning', () => {
    const state = createDefaultAppState();
    state.dailyRecords['2019-01-01'] = {
      u2win: { copies: 4, successes: 2, earningsCents: 6000 },
    };

    const snapshot = toRendererSnapshot(state);

    expect(snapshot.dailyState['2019-01-01']?.u2win).toEqual({
      copies: 4,
      successes: 2,
      earnings: 60,
    });
    expect(snapshot.lifetimeEarnings).toBe(60);
    expect(snapshot.lifetimeSuccesses).toBe(2);
  });

  it('projects per-site lifetime totals across all recorded days', () => {
    const state = createDefaultAppState();
    state.dailyRecords['2024-01-01'] = {
      u2win: { copies: 1, successes: 1, earningsCents: 3000 },
    };
    state.dailyRecords['2024-01-02'] = {
      u2win: { copies: 2, successes: 0, earningsCents: 0 },
    };

    const snapshot = toRendererSnapshot(state);
    const site = snapshot.sites.find((candidate) => candidate.id === 'u2win');

    expect(site).toBeDefined();
    expect(site?.copies).toBe(3);
    expect(site?.successes).toBe(1);
    expect(site?.earnings).toBe(30);
  });

  it('maps hotkey settings into the renderer snapshot', () => {
    const state = createDefaultAppState();
    state.settings.hotkeys = {
      enabled: false,
      bindings: [{ siteId: 'u2win', key: 'F3' }],
    };

    const snapshot = toRendererSnapshot(state);

    expect(snapshot.settings.hotkeys).toEqual({
      enabled: false,
      bindings: [{ siteId: 'u2win', key: 'F3' }],
    });
  });

  it('maps the daily check-in schedule into renderer settings', () => {
    const state = createDefaultAppState();
    state.settings.checkin.scheduleEnabled = true;
    state.settings.checkin.scheduleTime = '07:45';
    state.settings.checkin.lastScheduledRunDate = '2026-07-14';

    expect(toRendererSnapshot(state).settings.checkinSchedule).toEqual({
      enabled: true,
      time: '07:45',
      lastRunDate: '2026-07-14',
    });
  });

  it('deep-clones task collections so canonical state is not shared with the snapshot', () => {
    const state = createDefaultAppState();
    state.taskCategories = [{ id: 'category-a', name: 'Category A', colour: 'teal', sites: [] }];

    const snapshot = toRendererSnapshot(state);
    snapshot.tasks.categories[0]!.name = 'Mutated';

    expect(state.taskCategories[0]?.name).toBe('Category A');
  });
});
