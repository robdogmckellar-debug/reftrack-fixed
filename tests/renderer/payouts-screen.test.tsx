// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RefTrackApi } from '../../src/shared/ipc/contract';
import type { RendererSnapshot } from '../../src/shared/view-model/renderer-snapshot';
import { publishSnapshot, resetRendererForRetry } from '../../src/renderer/app/store';
import { PayoutsScreen } from '../../src/renderer/screens/payouts/PayoutsScreen';

function createSnapshot(overrides: Partial<RendererSnapshot> = {}): RendererSnapshot {
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
        copies: 2,
        successes: 2,
        earnings: 60,
        payoutThreshold: 25,
      },
    ],
    dailyState: {},
    activity: [],
    lifetimeEarnings: 60,
    lifetimeSuccesses: 2,
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
        id: 'payout-a',
        siteId: 'alpha',
        amount: 30,
        expectedDate: '2026-07-01',
        paidAt: null,
        createdAt: '2026-06-30T10:00:00.000Z',
        note: 'June payout',
      },
    ],
    ...overrides,
  };
}

function installApi(): {
  upsert: ReturnType<typeof vi.fn>;
  deletePayout: ReturnType<typeof vi.fn>;
} {
  const upsert = vi.fn();
  const deletePayout = vi.fn();
  const api = {
    payouts: { upsert, delete: deletePayout },
  } as unknown as RefTrackApi;
  Object.defineProperty(window, 'reftrack', { configurable: true, value: api });
  return { upsert, deletePayout };
}

beforeEach(() => {
  resetRendererForRetry();
  installApi();
});

afterEach(() => {
  cleanup();
  resetRendererForRetry();
});

describe('PayoutsScreen', () => {
  it('shows reconciliation totals and actionable alerts', () => {
    publishSnapshot(createSnapshot());
    render(<PayoutsScreen active />);

    expect(screen.getByRole('tabpanel', { name: 'Payouts' })).toBeTruthy();
    expect(screen.getAllByText('$60.00')).toHaveLength(3);
    expect(screen.getByText('1 overdue payout')).toBeTruthy();
    expect(screen.getByText('1 site ready for payout')).toBeTruthy();
    expect(screen.getByText('June payout')).toBeTruthy();
  });

  it('marks an expected payout as received through the typed command', async () => {
    const mocks = installApi();
    const initial = createSnapshot();
    const received = createSnapshot({
      revision: 2,
      payouts: [{ ...initial.payouts![0]!, paidAt: '2026-07-15T10:00:00.000Z' }],
    });
    mocks.upsert.mockResolvedValue({
      ok: true,
      data: { payoutId: 'payout-a', snapshot: received },
    });

    publishSnapshot(initial);
    render(<PayoutsScreen active />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark received' }));

    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(1));
    expect(mocks.upsert.mock.calls[0]?.[0]).toMatchObject({
      id: 'payout-a',
      siteId: 'alpha',
      amountCents: 3000,
      paidAt: expect.any(String),
    });
    expect(await screen.findByText('Payout marked as received.')).toBeTruthy();
  });

  it('adds a new expected payout from the dialog', async () => {
    const mocks = installApi();
    const initial = createSnapshot({ payouts: [] });
    const saved = createSnapshot({
      revision: 2,
      payouts: [
        {
          id: 'payout-new',
          siteId: 'alpha',
          amount: 45,
          expectedDate: '2026-07-30',
          paidAt: null,
          createdAt: '2026-07-15T10:00:00.000Z',
          note: 'July payout',
        },
      ],
    });
    mocks.upsert.mockResolvedValue({
      ok: true,
      data: { payoutId: 'payout-new', snapshot: saved },
    });

    publishSnapshot(initial);
    render(<PayoutsScreen active />);
    fireEvent.click(screen.getByRole('button', { name: 'Add payout' }));
    const dialog = screen.getByRole('dialog', { name: 'Add expected payout' });
    fireEvent.input(within(dialog).getByLabelText(/Amount/), { target: { value: '45.00' } });
    fireEvent.input(within(dialog).getByLabelText('Expected date'), {
      target: { value: '2026-07-30' },
    });
    fireEvent.input(within(dialog).getByLabelText('Note'), {
      target: { value: 'July payout' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add payout' }));

    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(1));
    expect(mocks.upsert.mock.calls[0]?.[0]).toMatchObject({
      id: null,
      siteId: 'alpha',
      amountCents: 4500,
      expectedDate: '2026-07-30',
      note: 'July payout',
    });
  });
});
