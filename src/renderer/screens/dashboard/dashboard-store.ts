import { batch, computed, signal, type Signal } from '@preact/signals';

import type {
  RendererActivityEntry,
  RendererDailyMetrics,
  RendererSite,
  RendererSnapshot,
} from '../../../shared/view-model/renderer-snapshot';
import { localDateKey } from './link-format';

export type DashboardFilter = 'all' | 'pending' | 'done';

export interface DashboardSummary {
  todayEarnings: number;
  todaySuccesses: number;
  todayCopies: number;
  lifetimeEarnings: number;
  lifetimeSuccesses: number;
}

const EMPTY_METRICS: RendererDailyMetrics = Object.freeze({
  copies: 0,
  successes: 0,
  earnings: 0,
});

const EMPTY_SUMMARY: DashboardSummary = Object.freeze({
  todayEarnings: 0,
  todaySuccesses: 0,
  todayCopies: 0,
  lifetimeEarnings: 0,
  lifetimeSuccesses: 0,
});

let latestSnapshot: RendererSnapshot | null = null;
const siteSignals = new Map<string, Signal<RendererSite | null>>();
const dailySignals = new Map<string, Signal<RendererDailyMetrics>>();

export const dashboardFilter = signal<DashboardFilter>('all');
export const dashboardDateKey = signal(localDateKey());
export const dashboardSiteIds = signal<readonly string[]>([]);
export const dashboardActivity = signal<readonly RendererActivityEntry[]>([]);
export const dashboardSummary = signal<DashboardSummary>(EMPTY_SUMMARY);
export const dashboardRevision = signal(0);
export const pendingCopySiteIds = signal<ReadonlySet<string>>(new Set());
export const pendingSuccessSiteIds = signal<ReadonlySet<string>>(new Set());
export const activityClearPending = signal(false);

function sameSite(left: RendererSite | null, right: RendererSite): boolean {
  return (
    left !== null &&
    left.id === right.id &&
    left.name === right.name &&
    left.url === right.url &&
    left.prefix === right.prefix &&
    left.suffix === right.suffix &&
    left.dateFormat === right.dateFormat &&
    left.bonus === right.bonus &&
    left.maxCopiesPerDay === right.maxCopiesPerDay &&
    left.copies === right.copies &&
    left.successes === right.successes &&
    left.earnings === right.earnings
  );
}

function sameMetrics(left: RendererDailyMetrics, right: RendererDailyMetrics): boolean {
  return (
    left.copies === right.copies &&
    left.successes === right.successes &&
    left.earnings === right.earnings
  );
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameActivity(
  left: readonly RendererActivityEntry[],
  right: readonly RendererActivityEntry[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const candidate = right[index];
    return (
      candidate !== undefined &&
      entry.id === candidate.id &&
      entry.occurredAt === candidate.occurredAt &&
      entry.type === candidate.type &&
      entry.siteId === candidate.siteId &&
      entry.siteName === candidate.siteName &&
      entry.amount === candidate.amount
    );
  });
}

function sameSummary(left: DashboardSummary, right: DashboardSummary): boolean {
  return (
    left.todayEarnings === right.todayEarnings &&
    left.todaySuccesses === right.todaySuccesses &&
    left.todayCopies === right.todayCopies &&
    left.lifetimeEarnings === right.lifetimeEarnings &&
    left.lifetimeSuccesses === right.lifetimeSuccesses
  );
}

function metricsFor(
  snapshot: RendererSnapshot,
  dateKey: string,
  siteId: string,
): RendererDailyMetrics {
  return snapshot.dailyState[dateKey]?.[siteId] ?? EMPTY_METRICS;
}

function calculateSummary(snapshot: RendererSnapshot, dateKey: string): DashboardSummary {
  const day = snapshot.dailyState[dateKey] ?? {};
  let todayEarnings = 0;
  let todaySuccesses = 0;
  let todayCopies = 0;

  for (const metrics of Object.values(day)) {
    todayEarnings += metrics.earnings;
    todaySuccesses += metrics.successes;
    todayCopies += metrics.copies;
  }

  return {
    todayEarnings,
    todaySuccesses,
    todayCopies,
    lifetimeEarnings: snapshot.lifetimeEarnings,
    lifetimeSuccesses: snapshot.lifetimeSuccesses,
  };
}

function ensureSiteSignal(siteId: string): Signal<RendererSite | null> {
  let target = siteSignals.get(siteId);
  if (!target) {
    target = signal<RendererSite | null>(null);
    siteSignals.set(siteId, target);
  }
  return target;
}

function ensureDailySignal(siteId: string): Signal<RendererDailyMetrics> {
  let target = dailySignals.get(siteId);
  if (!target) {
    target = signal<RendererDailyMetrics>(EMPTY_METRICS);
    dailySignals.set(siteId, target);
  }
  return target;
}

export function siteSignalFor(siteId: string): Signal<RendererSite | null> {
  return ensureSiteSignal(siteId);
}

export function dailySignalFor(siteId: string): Signal<RendererDailyMetrics> {
  return ensureDailySignal(siteId);
}

export const visibleDashboardSiteIds = computed<readonly string[]>(() => {
  const filter = dashboardFilter.value;
  if (filter === 'all') return dashboardSiteIds.value;

  return dashboardSiteIds.value.filter((siteId) => {
    const site = ensureSiteSignal(siteId).value;
    const metrics = ensureDailySignal(siteId).value;
    if (!site) return false;

    const maximum = site.maxCopiesPerDay;
    const complete = maximum > 0 && metrics.copies >= maximum;
    return filter === 'done' ? complete : !complete;
  });
});

export function synchroniseDashboard(
  snapshot: RendererSnapshot,
  dateKey = dashboardDateKey.peek(),
): void {
  latestSnapshot = snapshot;
  const activeSites = snapshot.sites.filter((site) => (site.lifecycle ?? 'active') === 'active');
  const nextIds = activeSites.map((site) => site.id);
  const activeIds = new Set(nextIds);
  const nextActivity = snapshot.activity.slice(0, 50);
  const nextSummary = calculateSummary(snapshot, dateKey);

  batch(() => {
    if (dashboardDateKey.peek() !== dateKey) dashboardDateKey.value = dateKey;
    if (!sameStringList(dashboardSiteIds.peek(), nextIds)) dashboardSiteIds.value = nextIds;

    for (const site of activeSites) {
      const siteTarget = ensureSiteSignal(site.id);
      if (!sameSite(siteTarget.peek(), site)) siteTarget.value = site;

      const metricsTarget = ensureDailySignal(site.id);
      const metrics = metricsFor(snapshot, dateKey, site.id);
      if (!sameMetrics(metricsTarget.peek(), metrics)) metricsTarget.value = metrics;
    }

    for (const [siteId, target] of siteSignals) {
      if (!activeIds.has(siteId) && target.peek() !== null) target.value = null;
    }
    for (const [siteId, target] of dailySignals) {
      if (!activeIds.has(siteId) && !sameMetrics(target.peek(), EMPTY_METRICS)) {
        target.value = EMPTY_METRICS;
      }
    }

    if (!sameActivity(dashboardActivity.peek(), nextActivity))
      dashboardActivity.value = nextActivity;
    if (!sameSummary(dashboardSummary.peek(), nextSummary)) dashboardSummary.value = nextSummary;
    if (dashboardRevision.peek() !== snapshot.revision) dashboardRevision.value = snapshot.revision;
  });
}

export function siteStreakFor(siteId: string, now = new Date()): number {
  const snapshot = latestSnapshot;
  if (!snapshot) return 0;

  let streak = 0;
  for (let offset = 0; offset < 30; offset += 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - offset);
    const copies = snapshot.dailyState[localDateKey(date)]?.[siteId]?.copies ?? 0;
    if (copies < 1) break;
    streak += 1;
  }
  return streak;
}

export function refreshDashboardDate(date = new Date()): void {
  const nextDateKey = localDateKey(date);
  if (nextDateKey === dashboardDateKey.peek()) return;

  if (latestSnapshot) synchroniseDashboard(latestSnapshot, nextDateKey);
  else dashboardDateKey.value = nextDateKey;
}

function updatePendingSet(
  target: Signal<ReadonlySet<string>>,
  siteId: string,
  pending: boolean,
): void {
  const current = target.peek();
  const alreadyMatches = pending ? current.has(siteId) : !current.has(siteId);
  if (alreadyMatches) return;

  const next = new Set(current);
  if (pending) next.add(siteId);
  else next.delete(siteId);
  target.value = next;
}

export function setCopyPending(siteId: string, pending: boolean): void {
  updatePendingSet(pendingCopySiteIds, siteId, pending);
}

export function setSuccessPending(siteId: string, pending: boolean): void {
  updatePendingSet(pendingSuccessSiteIds, siteId, pending);
}

export function resetDashboardStore(): void {
  latestSnapshot = null;
  siteSignals.clear();
  dailySignals.clear();
  batch(() => {
    dashboardFilter.value = 'all';
    dashboardDateKey.value = localDateKey();
    dashboardSiteIds.value = [];
    dashboardActivity.value = [];
    dashboardSummary.value = EMPTY_SUMMARY;
    dashboardRevision.value = 0;
    pendingCopySiteIds.value = new Set();
    pendingSuccessSiteIds.value = new Set();
    activityClearPending.value = false;
  });
}
