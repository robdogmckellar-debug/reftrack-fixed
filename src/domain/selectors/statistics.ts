import type { AppStateV1, StateTotals } from '../app-state';

const EMPTY_TOTALS: StateTotals = {
  copies: 0,
  successes: 0,
  earningsCents: 0,
};

export function calculateLifetimeTotals(state: AppStateV1): StateTotals {
  const totals = { ...EMPTY_TOTALS };

  for (const day of Object.values(state.dailyRecords)) {
    for (const metrics of Object.values(day)) {
      totals.copies += metrics.copies;
      totals.successes += metrics.successes;
      totals.earningsCents += metrics.earningsCents;
    }
  }

  return totals;
}

export function calculateSiteTotals(state: AppStateV1, siteId: string): StateTotals {
  const totals = { ...EMPTY_TOTALS };

  for (const day of Object.values(state.dailyRecords)) {
    const metrics = day[siteId];
    if (!metrics) continue;

    totals.copies += metrics.copies;
    totals.successes += metrics.successes;
    totals.earningsCents += metrics.earningsCents;
  }

  return totals;
}
