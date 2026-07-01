import { describe, expect, it } from 'vitest';

import { createDefaultAppState } from '../../src/domain/defaults';
import {
  toCanonicalAppState,
  toLegacyAppData,
  type LegacyAppData,
} from '../../src/main/view-model/renderer-snapshot-adapter';

describe('renderer snapshot adapter', () => {
  it('round-trips integer currency and historical records without pruning', () => {
    const state = createDefaultAppState();
    state.dailyRecords['2019-01-01'] = {
      u2win: { copies: 4, successes: 2, earningsCents: 6000 },
    };

    const legacy = toLegacyAppData(state);
    expect(legacy.dailyState['2019-01-01']?.u2win).toEqual({
      copies: 4,
      successes: 2,
      earnings: 60,
    });
    expect(legacy.lifetimeEarnings).toBe(60);

    const canonical = toCanonicalAppState(legacy, state);
    expect(canonical.dailyRecords['2019-01-01']?.u2win?.earningsCents).toBe(6000);
  });

  it('preserves task-site IDs across reordering and removes orphan progress', () => {
    const previous = createDefaultAppState();
    const legacy: LegacyAppData = {
      sites: toLegacyAppData(previous).sites,
      dailyState: {},
      activity: [],
      settings: {
        darkMode: true,
        folderClearEnabled: false,
      },
      tasks: {
        categories: [
          {
            id: 'category-a',
            name: 'Category A',
            colour: 'teal',
            sites: [
              { id: 'site-b', name: 'B', url: 'https://b.example' },
              { id: 'site-a', name: 'A', url: 'https://a.example' },
            ],
          },
        ],
      },
      tasksDailyState: {
        '2026-06-30': {
          'category-a': {
            'site-a': true,
            'site-b': false,
            removed: true,
          },
          removedCategory: {
            removed: true,
          },
        },
      },
    };

    const canonical = toCanonicalAppState(legacy, previous);
    expect(canonical.taskCategories[0]?.sites.map((site) => site.id)).toEqual(['site-b', 'site-a']);
    expect(canonical.taskDailyRecords['2026-06-30']).toEqual({
      'category-a': {
        'site-a': true,
        'site-b': false,
      },
    });
  });
});
