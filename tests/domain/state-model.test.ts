import { describe, expect, it } from 'vitest';

import type { AppStateV1 } from '../../src/domain/app-state';
import { createDefaultAppState } from '../../src/domain/defaults';
import {
  calculateLifetimeTotals,
  calculateSiteTotals,
  calculateTotalsIndex,
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
    const totalsIndex = calculateTotalsIndex(state);
    expect(totalsIndex.lifetime).toEqual({
      copies: 4,
      successes: 4,
      earningsCents: 12000,
    });
    expect(totalsIndex.bySiteId.get('u2win')).toEqual({
      copies: 3,
      successes: 3,
      earningsCents: 9000,
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

  it('defaults legacy sites to active with empty private notes', () => {
    const state = createDefaultAppState();
    const parsed = parseAppState(state);

    expect(parsed.sites[0]).toMatchObject({
      notes: '',
      lifecycle: 'active',
      lifecycleChangedAt: null,
      appClaim: {
        enabled: false,
        downloadUrl: '',
        apkPath: null,
        packageName: '',
        deepLinkUrl: '',
        avdName: '',
      },
    });
  });

  it('defaults legacy settings to disabled image tools and no saved Facebook groups', () => {
    const state = createDefaultAppState();
    const parsed = parseAppState({
      ...state,
      settings: {
        darkMode: state.settings.darkMode,
        imageCleaner: state.settings.imageCleaner,
        checkin: state.settings.checkin,
        hotkeys: state.settings.hotkeys,
      },
    });

    expect(parsed.settings.imageCompressor).toEqual({
      enabled: false,
      folderPath: null,
      quality: 70,
    });
    expect(parsed.settings.facebookGroupShares).toEqual({ groups: [] });
  });
});
