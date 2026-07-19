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

export interface StateTotalsIndex {
  lifetime: StateTotals;
  bySiteId: ReadonlyMap<string, StateTotals>;
}

export function calculateTotalsIndex(state: AppStateV1): StateTotalsIndex {
  const lifetime = { ...EMPTY_TOTALS };
  const bySiteId = new Map<string, StateTotals>();

  for (const day of Object.values(state.dailyRecords)) {
    for (const [siteId, metrics] of Object.entries(day)) {
      lifetime.copies += metrics.copies;
      lifetime.successes += metrics.successes;
      lifetime.earningsCents += metrics.earningsCents;

      let siteTotals = bySiteId.get(siteId);
      if (!siteTotals) {
        siteTotals = { ...EMPTY_TOTALS };
        bySiteId.set(siteId, siteTotals);
      }
      siteTotals.copies += metrics.copies;
      siteTotals.successes += metrics.successes;
      siteTotals.earningsCents += metrics.earningsCents;
    }
  }

  return { lifetime, bySiteId };
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
