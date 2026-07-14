import { describe, expect, it } from 'vitest';

import type { AppStateV1 } from '../../src/domain/app-state';
import { createDefaultAppState } from '../../src/domain/defaults';
import {
  calculateLifetimeTotals,
  calculateSiteTotals,
} from '../../src/domain/selectors/statistics';
import { parseAppState } from '../../src/main/persistence/state-schema';

describe('canonical state model', () => {
  it('stores currency as integer cents and retains historical daily records', () => {
    const state = createDefaultAppState();
    state.dailyRecords['2020-01-01'] = {
      u2win: { copies: 2, successes: 1, earningsCents: 3000 },
    };
    state.dailyRecords['2026-06-30'] = {
      u2win: { copies: 1, successes: 2, earningsCents: 6000 },
      galaxy: { copies: 1, successes: 1, earningsCents: 3000 },
    };

    expect(calculateSiteTotals(state, 'u2win')).toEqual({
      copies: 3,
      successes: 3,
      earningsCents: 9000,
    });
    expect(calculateLifetimeTotals(state)).toEqual({
      copies: 4,
      successes: 4,
      earningsCents: 12000,
    });
    expect(parseAppState(state).dailyRecords['2020-01-01']).toBeDefined();
  });

  it('rejects fractional cents, invalid dates, and duplicate stable IDs', () => {
    const fractional = createDefaultAppState();
    fractional.dailyRecords['2026-06-30'] = {
      u2win: { copies: 1, successes: 1, earningsCents: 1.5 },
    };
    expect(() => parseAppState(fractional)).toThrow();

    const invalidDate = createDefaultAppState() as AppStateV1;
    invalidDate.dailyRecords['2026-02-31'] = {};
    expect(() => parseAppState(invalidDate)).toThrow();

    const duplicate = createDefaultAppState();
    duplicate.sites.push({ ...duplicate.sites[0]! });
    expect(() => parseAppState(duplicate)).toThrow(/Duplicate site ID/);
  });

  it('loads saved state containing retired Auto-Share fields and strips them', () => {
    const state = createDefaultAppState();
    const parsed = parseAppState({
      ...state,
      sites: state.sites.map((site, index) =>
        index === 0 ? { ...site, autoShareEnabled: true, groupsPerRun: 6 } : site,
      ),
      settings: {
        ...state.settings,
        autoShare: { defaultEnabled: true },
      },
      autoShareRotation: { groupCursor: 4, sitesSinceReset: 2 },
    });

    expect(parsed.sites[0]).not.toHaveProperty('autoShareEnabled');
    expect(parsed.sites[0]).not.toHaveProperty('groupsPerRun');
    expect(parsed.settings).not.toHaveProperty('autoShare');
    expect(parsed).not.toHaveProperty('autoShareRotation');
  });
});
