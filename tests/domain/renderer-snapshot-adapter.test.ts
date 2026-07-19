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

  it('maps image compressor settings into the renderer snapshot', () => {
    const state = createDefaultAppState();
    state.settings.imageCompressor = {
      enabled: true,
      folderPath: 'C:\\Users\\Test\\Pictures\\Compressor',
      quality: 64,
    };

    expect(toRendererSnapshot(state).settings).toMatchObject({
      imageCompressorEnabled: true,
      imageCompressorPath: 'C:\\Users\\Test\\Pictures\\Compressor',
      imageCompressorQuality: 64,
    });
  });

  it('maps saved Facebook groups into renderer settings', () => {
    const state = createDefaultAppState();
    state.settings.facebookGroupShares.groups.push({
      id: 'facebook-group-a',
      label: 'VIP Group',
      groupUrl: 'https://www.facebook.com/groups/vip/',
      currentPostUrl: 'https://www.facebook.com/groups/vip/posts/123',
      useMostRecentPost: true,
    });

    expect(toRendererSnapshot(state).settings.facebookGroupShares).toEqual([
      {
        id: 'facebook-group-a',
        label: 'VIP Group',
        groupUrl: 'https://www.facebook.com/groups/vip/',
        currentPostUrl: 'https://www.facebook.com/groups/vip/posts/123',
        useMostRecentPost: true,
      },
    ]);
  });

  it('maps per-site app claim settings into renderer sites', () => {
    const state = createDefaultAppState();
    state.sites[0]!.appClaim = {
      enabled: true,
      downloadUrl: 'https://alpha.example/app',
      apkPath: 'C:\\Apps\\alpha.apk',
      packageName: 'com.alpha.claim',
      deepLinkUrl: 'https://alpha.example/claim',
      avdName: 'Pixel_8_API_35',
    };

    expect(toRendererSnapshot(state).sites[0]?.appClaim).toEqual({
      enabled: true,
      downloadUrl: 'https://alpha.example/app',
      apkPath: 'C:\\Apps\\alpha.apk',
      packageName: 'com.alpha.claim',
      deepLinkUrl: 'https://alpha.example/claim',
      avdName: 'Pixel_8_API_35',
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
