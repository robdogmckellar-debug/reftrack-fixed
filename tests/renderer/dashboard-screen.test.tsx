// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RefTrackApi } from '../../src/shared/ipc/contract';
import type { RendererSnapshot } from '../../src/shared/view-model/renderer-snapshot';
import { publishSnapshot } from '../../src/renderer/app/store';
import { DashboardScreen } from '../../src/renderer/screens/dashboard/DashboardScreen';
import {
  dashboardFilter,
  resetDashboardStore,
} from '../../src/renderer/screens/dashboard/dashboard-store';

function createSnapshot(overrides: Partial<RendererSnapshot> = {}): RendererSnapshot {
  return {
    revision: 1,
    sites: [
      {
        id: 'site-alpha',
        name: 'Alpha',
        url: 'https://alpha.example/ref',
        prefix: 'Join',
        suffix: '',
        dateFormat: '',
        bonus: 30,
        maxCopiesPerDay: 1,
        copies: 0,
        successes: 0,
        earnings: 0,
      },
      {
        id: 'site-bravo',
        name: 'Bravo',
        url: 'https://bravo.example/ref',
        prefix: '',
        suffix: '',
        dateFormat: '',
        bonus: 20,
        maxCopiesPerDay: 2,
        copies: 1,
        successes: 0,
        earnings: 0,
      },
    ],
    dailyState: {},
    activity: [],
    lifetimeEarnings: 0,
    lifetimeSuccesses: 0,
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

interface ApiMocks {
  copyLink: ReturnType<typeof vi.fn>;
  recordSuccess: ReturnType<typeof vi.fn>;
  undoSuccess: ReturnType<typeof vi.fn>;
  clearActivity: ReturnType<typeof vi.fn>;
  openExternal: ReturnType<typeof vi.fn>;
  launchAndroidPackage: ReturnType<typeof vi.fn>;
  openAndroidDeepLink: ReturnType<typeof vi.fn>;
  addSitesToCategories: ReturnType<typeof vi.fn>;
}

function installApi(): ApiMocks {
  const copyLink = vi.fn();
  const recordSuccess = vi.fn();
  const undoSuccess = vi.fn();
  const clearActivity = vi.fn();
  const openExternal = vi.fn().mockResolvedValue({ ok: true, data: { opened: true } });
  const launchAndroidPackage = vi.fn().mockResolvedValue({ ok: true, data: { launched: true } });
  const openAndroidDeepLink = vi.fn().mockResolvedValue({ ok: true, data: { opened: true } });
  const addSitesToCategories = vi.fn();
  const api = {
    bootstrap: vi.fn(),
    sites: {
      upsert: vi.fn(),
      delete: vi.fn(),
      launchAndroidPackage,
      openAndroidDeepLink,
    },
    activity: { clear: clearActivity },
    actions: { copyLink, recordSuccess, undoSuccess },
    settings: { setImageCleanerEnabled: vi.fn(), selectImageCleanerFolder: vi.fn() },
    imageCleaner: { onCompleted: vi.fn(() => () => undefined) },
    tasks: {
      upsertCategory: vi.fn(),
      addSitesToCategories,
      deleteCategory: vi.fn(),
      setCompletion: vi.fn(),
      setCompletions: vi.fn(),
    },
    external: { open: openExternal },
    notifications: {
      showAction: vi.fn().mockResolvedValue({ ok: true, data: { shown: true } }),
    },
    importer: {
      start: vi.fn(),
      cancel: vi.fn(),
      onProgress: vi.fn(() => () => undefined),
      onCompleted: vi.fn(() => () => undefined),
    },
  } as unknown as RefTrackApi;

  Object.defineProperty(window, 'reftrack', { configurable: true, value: api });
  return {
    copyLink,
    recordSuccess,
    undoSuccess,
    clearActivity,
    openExternal,
    launchAndroidPackage,
    openAndroidDeepLink,
    addSitesToCategories,
  };
}

beforeEach(() => {
  resetDashboardStore();
  dashboardFilter.value = 'all';
  installApi();
});

afterEach(() => {
  cleanup();
  resetDashboardStore();
});

describe('DashboardScreen', () => {
  it('renders semantic summary, site cards, filters, and an activity empty state', () => {
    publishSnapshot(createSnapshot());
    render(<DashboardScreen active />);

    expect(screen.getByRole('tabpanel', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Dashboard summary' })).toBeTruthy();
    expect(screen.getByRole('article', { name: 'Alpha' })).toBeTruthy();
    expect(screen.getByRole('article', { name: 'Bravo' })).toBeTruthy();
    expect(screen.getByText('No activity yet')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Complete' }));
    expect(screen.queryByRole('article', { name: 'Alpha' })).toBeNull();
    expect(screen.queryByRole('article', { name: 'Bravo' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ready' }));
    expect(screen.getByRole('article', { name: 'Alpha' })).toBeTruthy();
    expect(screen.getByRole('article', { name: 'Bravo' })).toBeTruthy();
  });

  it('copies through one typed command and updates only from the returned snapshot', async () => {
    const mocks = installApi();
    const initial = createSnapshot();
    const copied = createSnapshot({
      revision: 2,
      sites: initial.sites.map((site) =>
        site.id === 'site-alpha' ? { ...site, copies: 1 } : site,
      ),
      dailyState: {
        [[
          new Date().getFullYear(),
          String(new Date().getMonth() + 1).padStart(2, '0'),
          String(new Date().getDate()).padStart(2, '0'),
        ].join('-')]: {
          'site-alpha': { copies: 1, successes: 0, earnings: 0 },
        },
      },
      activity: [
        {
          id: 'activity-copy',
          occurredAt: new Date().toISOString(),
          time: '12:00',
          type: 'copy',
          siteId: 'site-alpha',
          siteName: 'Alpha',
          amount: null,
          ts: Date.now(),
        },
      ],
    });
    mocks.copyLink.mockResolvedValue({
      ok: true,
      data: { snapshot: copied, cleanup: { status: 'disabled', jobId: null } },
    });

    publishSnapshot(initial);
    render(<DashboardScreen active />);
    const alpha = screen.getByRole('article', { name: 'Alpha' });
    fireEvent.click(within(alpha).getByRole('button', { name: 'Copy link' }));

    await waitFor(() => expect(mocks.copyLink).toHaveBeenCalledTimes(1));
    expect(mocks.copyLink.mock.calls[0]?.[0]).toMatchObject({
      siteId: 'site-alpha',
      text: 'Join https://alpha.example/ref',
    });
    await waitFor(() =>
      expect(
        within(screen.getByRole('article', { name: 'Alpha' })).getByRole('button', {
          name: 'Complete today',
        }),
      ).toBeTruthy(),
    );
    expect(screen.getByText('Alpha copied')).toBeTruthy();
  });

  it('records and precisely undoes the returned success transaction', async () => {
    const mocks = installApi();
    const initial = createSnapshot();
    const successful = createSnapshot({
      revision: 2,
      sites: initial.sites.map((site) =>
        site.id === 'site-alpha' ? { ...site, successes: 1, earnings: 30 } : site,
      ),
      lifetimeEarnings: 30,
      lifetimeSuccesses: 1,
    });
    mocks.recordSuccess.mockResolvedValue({
      ok: true,
      data: { snapshot: successful, activityId: 'activity-success', bonusCents: 3000 },
    });
    mocks.undoSuccess.mockResolvedValue({
      ok: true,
      data: { snapshot: { ...initial, revision: 3 } },
    });

    publishSnapshot(initial);
    render(<DashboardScreen active />);
    const alpha = screen.getByRole('article', { name: 'Alpha' });
    fireEvent.click(within(alpha).getByRole('button', { name: /Record .*30\.00/ }));

    await waitFor(() => expect(mocks.recordSuccess).toHaveBeenCalledTimes(1));
    const undoButton = await screen.findByRole('button', { name: 'Undo' });
    fireEvent.click(undoButton);

    await waitFor(() =>
      expect(mocks.undoSuccess).toHaveBeenCalledWith({ activityId: 'activity-success' }),
    );
    await waitFor(() => expect(screen.getByText('Success removed')).toBeTruthy());
  });

  it('selects multiple cards and opens their URLs in order', async () => {
    const mocks = installApi();
    publishSnapshot(createSnapshot());
    render(<DashboardScreen active />);

    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Bravo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open sites' }));

    await waitFor(() => expect(mocks.openExternal).toHaveBeenCalledTimes(2));
    expect(mocks.openExternal).toHaveBeenNthCalledWith(1, {
      url: 'https://alpha.example/ref',
    });
    expect(mocks.openExternal).toHaveBeenNthCalledWith(2, {
      url: 'https://bravo.example/ref',
    });
  });

  it('launches the Android app instead of the browser when an app-claim site name is opened', async () => {
    const mocks = installApi();
    publishSnapshot(
      createSnapshot({
        sites: [
          {
            id: 'site-alpha',
            name: 'Alpha',
            url: 'https://alpha.example/ref',
            prefix: 'Join',
            suffix: '',
            dateFormat: '',
            bonus: 30,
            maxCopiesPerDay: 1,
            copies: 0,
            successes: 0,
            earnings: 0,
            appClaim: {
              enabled: true,
              downloadUrl: '',
              apkPath: 'C:\\Apps\\alpha.apk',
              packageName: 'com.alpha.claim',
              deepLinkUrl: '',
              avdName: 'Pixel_8_API_35',
            },
          },
        ],
      }),
    );
    render(<DashboardScreen active />);

    fireEvent.click(await screen.findByRole('button', { name: 'Alpha' }));

    await waitFor(() =>
      expect(mocks.launchAndroidPackage).toHaveBeenCalledWith({
        packageName: 'com.alpha.claim',
        avdName: 'Pixel_8_API_35',
      }),
    );
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });

  it('adds selected referral cards to a new Daily Tasks category', async () => {
    const mocks = installApi();
    const initial = createSnapshot();
    mocks.addSitesToCategories.mockImplementation(async (request) => ({
      ok: true,
      data: {
        categoryIds: [request.newCategory.id],
        snapshot: {
          ...initial,
          revision: 2,
          tasks: {
            categories: [{ ...request.newCategory, sites: request.sites }],
          },
        },
      },
    }));

    publishSnapshot(initial);
    render(<DashboardScreen active />);
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to category' }));

    const dialog = screen.getByRole('dialog', { name: 'Add 1 site to categories' });
    fireEvent.input(within(dialog).getByLabelText('New category'), {
      target: { value: 'Priority' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add to categories' }));

    await waitFor(() => expect(mocks.addSitesToCategories).toHaveBeenCalledTimes(1));
    expect(mocks.addSitesToCategories.mock.calls[0]?.[0]).toMatchObject({
      sites: [
        {
          sourceSiteId: 'site-alpha',
          name: 'Alpha',
          url: 'https://alpha.example/ref',
        },
      ],
      categoryIds: [],
      newCategory: { name: 'Priority' },
    });
  });
});
