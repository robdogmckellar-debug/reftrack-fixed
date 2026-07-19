// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RefTrackApi } from '../../src/shared/ipc/contract';
import type { RendererSnapshot } from '../../src/shared/view-model/renderer-snapshot';
import { publishSnapshot, resetRendererForRetry } from '../../src/renderer/app/store';
import { ShareQueueScreen } from '../../src/renderer/screens/share-queue/ShareQueueScreen';
import {
  clearShareQueue,
  queueReferralSites,
} from '../../src/renderer/screens/share-queue/share-queue-store';

const selectedImagePath = 'C:\\Shares\\launch.png';

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
    ],
    dailyState: {},
    activity: [],
    lifetimeEarnings: 0,
    lifetimeSuccesses: 0,
    settings: {
      darkMode: true,
      folderClearEnabled: false,
      folderClearPath: null,
      checkinSchedule: { enabled: false, time: '09:00', lastRunDate: null },
      hotkeys: { enabled: false, bindings: [] },
    },
    tasks: { categories: [] },
    tasksDailyState: {},
    checkinDailyState: {},
    ...overrides,
  };
}

function installApi(snapshot = createSnapshot()): {
  copyLink: ReturnType<typeof vi.fn>;
  openExternal: ReturnType<typeof vi.fn>;
  upsertFacebookGroupShare: ReturnType<typeof vi.fn>;
  deleteFacebookGroupShare: ReturnType<typeof vi.fn>;
} {
  const copyLink = vi.fn().mockResolvedValue({
    ok: true,
    data: { snapshot, cleanup: { status: 'disabled', jobId: null } },
  });
  const openExternal = vi.fn().mockResolvedValue({ ok: true, data: { opened: true } });
  const upsertFacebookGroupShare = vi.fn();
  const deleteFacebookGroupShare = vi.fn();

  const api = {
    actions: {
      copyLink,
      copyText: vi.fn().mockResolvedValue({ ok: true, data: { copied: true } }),
      selectShareImage: vi.fn().mockResolvedValue({
        ok: true,
        data: { selected: true, filePath: selectedImagePath },
      }),
      recordSuccess: vi.fn(),
      undoSuccess: vi.fn(),
    },
    external: {
      open: openExternal,
    },
    settings: {
      upsertFacebookGroupShare,
      deleteFacebookGroupShare,
    },
    shareQueue: {
      onAdvanceHotkey: vi.fn(() => () => undefined),
    },
  } as unknown as RefTrackApi;

  Object.defineProperty(window, 'reftrack', { configurable: true, value: api });
  return { copyLink, openExternal, upsertFacebookGroupShare, deleteFacebookGroupShare };
}

beforeEach(() => {
  resetRendererForRetry();
  clearShareQueue();
});

afterEach(() => {
  cleanup();
  clearShareQueue();
  resetRendererForRetry();
});

describe('ShareQueueScreen', () => {
  it('saves Facebook groups, adds one to the current share, and opens its current post', async () => {
    const snapshot = createSnapshot();
    const group = {
      id: 'facebook-group-a',
      label: 'VIP Group',
      groupUrl: 'https://www.facebook.com/groups/vip/',
      currentPostUrl: 'https://www.facebook.com/groups/vip/posts/123',
      useMostRecentPost: true,
    };
    const mocks = installApi(snapshot);
    mocks.upsertFacebookGroupShare.mockResolvedValue({
      ok: true,
      data: {
        groupId: group.id,
        snapshot: createSnapshot({
          revision: 2,
          settings: {
            ...snapshot.settings,
            facebookGroupShares: [group],
          },
        }),
      },
    });
    publishSnapshot(snapshot);
    queueReferralSites(snapshot.sites);

    render(<ShareQueueScreen active />);

    expect(screen.getByRole('tabpanel', { name: 'Facebook Group Shares' })).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Group name'), { target: { value: group.label } });
    fireEvent.input(screen.getByLabelText('Facebook group link'), {
      target: { value: group.groupUrl },
    });
    fireEvent.input(screen.getByLabelText('Current post link'), {
      target: { value: group.currentPostUrl },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Most recent post' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add group' }));

    await waitFor(() =>
      expect(mocks.upsertFacebookGroupShare).toHaveBeenCalledWith({
        id: null,
        label: group.label,
        groupUrl: group.groupUrl,
        currentPostUrl: group.currentPostUrl,
        useMostRecentPost: true,
      }),
    );

    const savedList = await screen.findByRole('list', { name: 'Saved Facebook groups' });
    const savedRow = within(savedList).getByText(group.label).closest('li') as HTMLElement;
    fireEvent.click(within(savedRow).getByRole('button', { name: 'Add to share' }));

    expect(await screen.findByText('Group: VIP Group')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open current post' }));

    await waitFor(() =>
      expect(mocks.openExternal).toHaveBeenCalledWith({ url: group.currentPostUrl }),
    );
  });

  it('copies the edited post text together with the attached image path', async () => {
    const snapshot = createSnapshot();
    const mocks = installApi(snapshot);
    publishSnapshot(snapshot);
    queueReferralSites(snapshot.sites);

    render(<ShareQueueScreen active />);

    fireEvent.input(screen.getByLabelText('Prepared post'), {
      target: { value: 'Custom promo post\nSecond line' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Choose image' }));

    await waitFor(() => expect(screen.getByText(selectedImagePath)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Copy post' }));

    await waitFor(() => expect(mocks.copyLink).toHaveBeenCalledTimes(1));
    expect(mocks.copyLink).toHaveBeenCalledWith({
      siteId: 'site-alpha',
      text: 'Custom promo post\nSecond line',
      imagePath: selectedImagePath,
      occurredAt: expect.any(String),
    });
  });
});
