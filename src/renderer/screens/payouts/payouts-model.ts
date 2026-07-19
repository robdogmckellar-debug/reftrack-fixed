import type {
  RendererPayoutEntry,
  RendererSite,
  RendererSnapshot,
} from '../../../shared/view-model/renderer-snapshot';

export type PayoutStatus = 'pending' | 'overdue' | 'paid';

export interface PayoutLedgerEntry extends RendererPayoutEntry {
  siteName: string;
  status: PayoutStatus;
}

export interface SitePayoutSummary {
  site: RendererSite;
  received: number;
  outstanding: number;
  threshold: number;
  thresholdReached: boolean;
}

export interface PayoutModel {
  recordedEarnings: number;
  received: number;
  outstanding: number;
  pending: number;
  overdueCount: number;
  thresholdCount: number;
  entries: readonly PayoutLedgerEntry[];
  sites: readonly SitePayoutSummary[];
}

export function payoutStatus(entry: RendererPayoutEntry, today: string): PayoutStatus {
  if (entry.paidAt) return 'paid';
  return entry.expectedDate < today ? 'overdue' : 'pending';
}

export function buildPayoutModel(snapshot: RendererSnapshot, today: string): PayoutModel {
  const payouts = snapshot.payouts ?? [];
  const siteById = new Map(snapshot.sites.map((site) => [site.id, site]));
  const receivedBySite = new Map<string, number>();
  let received = 0;
  let pending = 0;
  let overdueCount = 0;

  const entries = payouts
    .map((entry): PayoutLedgerEntry => {
      const status = payoutStatus(entry, today);
      if (status === 'paid') {
        received += entry.amount;
        receivedBySite.set(entry.siteId, (receivedBySite.get(entry.siteId) ?? 0) + entry.amount);
      } else {
        pending += entry.amount;
        if (status === 'overdue') overdueCount += 1;
      }
      return {
        ...entry,
        siteName: siteById.get(entry.siteId)?.name ?? 'Deleted site',
        status,
      };
    })
    .sort((left, right) => {
      const order: Record<PayoutStatus, number> = { overdue: 0, pending: 1, paid: 2 };
      return (
        order[left.status] - order[right.status] ||
        left.expectedDate.localeCompare(right.expectedDate) ||
        right.createdAt.localeCompare(left.createdAt)
      );
    });

  const sites = snapshot.sites
    .filter((site) => (site.lifecycle ?? 'active') !== 'trashed')
    .map((site): SitePayoutSummary => {
      const siteReceived = receivedBySite.get(site.id) ?? 0;
      const outstanding = Math.max(0, site.earnings - siteReceived);
      const threshold = site.payoutThreshold ?? 0;
      return {
        site,
        received: siteReceived,
        outstanding,
        threshold,
        thresholdReached: threshold > 0 && outstanding >= threshold,
      };
    })
    .sort(
      (left, right) =>
        Number(right.thresholdReached) - Number(left.thresholdReached) ||
        right.outstanding - left.outstanding ||
        left.site.name.localeCompare(right.site.name),
    );

  return {
    recordedEarnings: snapshot.lifetimeEarnings,
    received,
    outstanding: Math.max(0, snapshot.lifetimeEarnings - received),
    pending,
    overdueCount,
    thresholdCount: sites.filter((site) => site.thresholdReached).length,
    entries,
    sites,
  };
}
