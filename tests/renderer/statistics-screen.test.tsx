// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RendererSnapshot } from '../../src/shared/view-model/renderer-snapshot';
import { publishSnapshot, resetRendererForRetry } from '../../src/renderer/app/store';
import { StatisticsScreen } from '../../src/renderer/screens/statistics/StatisticsScreen';

function createSnapshot(): RendererSnapshot {
  const year = new Date().getFullYear();
  return {
    revision: 8,
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
        copies: 4,
        successes: 1,
        earnings: 30,
      },
      {
        id: 'beta',
        name: 'BETA',
        url: 'https://beta.example',
        prefix: '',
        suffix: '',
        dateFormat: '',
        bonus: 20,
        maxCopiesPerDay: 1,
        copies: 3,
        successes: 2,
        earnings: 40,
      },
    ],
    dailyState: {
      [`${year}-06-15`]: {
        alpha: { copies: 4, successes: 1, earnings: 30 },
        beta: { copies: 3, successes: 2, earnings: 40 },
      },
    },
    activity: [],
    lifetimeEarnings: 70,
    lifetimeSuccesses: 3,
    settings: { darkMode: true, folderClearEnabled: false, folderClearPath: null },
    tasks: { categories: [] },
    tasksDailyState: {},
  };
}

beforeEach(() => {
  resetRendererForRetry();
  publishSnapshot(createSnapshot());
});

afterEach(() => {
  cleanup();
  resetRendererForRetry();
});

describe('StatisticsScreen', () => {
  it('renders accessible ranking controls and a 12-month year overview', () => {
    render(<StatisticsScreen active />);

    expect(screen.getByRole('tabpanel', { name: 'Statistics' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: /Top sites/i })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Leaderboard metric' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Leaderboard period' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /June:/i })).toBeTruthy();
    const months = screen.getByRole('list', { name: /Months in/ });
    expect(within(months).getAllByRole('listitem')).toHaveLength(12);
    expect(screen.getByText('ALPHA')).toBeTruthy();
    expect(screen.getByText('BETA')).toBeTruthy();
  });

  it('switches leaderboard metric and drills from month into one day and back', () => {
    render(<StatisticsScreen active />);

    fireEvent.click(screen.getByRole('button', { name: 'Most successful' }));
    expect(
      screen.getByRole('button', { name: 'Most successful' }).getAttribute('aria-pressed'),
    ).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /June:/i }));
    expect(screen.getByRole('heading', { name: 'June' })).toBeTruthy();
    const dayButton = screen.getByRole('button', {
      name: /Mon 15:|Tue 15:|Wed 15:|Thu 15:|Fri 15:|Sat 15:|Sun 15:/,
    });
    fireEvent.click(dayButton);

    expect(screen.getByText(/15 June/)).toBeTruthy();
    const table = screen.getByRole('table', { name: /Site performance/ });
    expect(within(table).getByText('ALPHA')).toBeTruthy();
    expect(within(table).getByText('BETA')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Month calendar' }));
    expect(screen.getByRole('heading', { name: 'June' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Year overview' }));
    expect(screen.getByRole('button', { name: /June:/i })).toBeTruthy();
  });

  it('does not calculate or expose screen content while inactive', () => {
    const { container } = render(<StatisticsScreen active={false} />);
    const panel = container.querySelector('#tab-statistics');
    expect(panel?.hasAttribute('hidden')).toBe(true);
  });
});
