import type {
  RendererDailyMetrics,
  RendererSnapshot,
} from '../../../shared/view-model/renderer-snapshot';

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export const SHORT_DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export type LeaderboardMetric = 'copies' | 'successes';
export type LeaderboardPeriod = 'alltime' | 'yearly' | 'monthly' | 'weekly';

export interface StatisticsTotals {
  earnings: number;
  successes: number;
  copies: number;
}

export interface SiteStatisticsTotals extends StatisticsTotals {
  siteId: string;
  name: string;
}

export interface LeaderboardEntry extends SiteStatisticsTotals {
  rank: number;
  value: number;
  percentage: number;
}

export interface MonthStatistics {
  month: number;
  name: string;
  shortName: string;
  totals: StatisticsTotals;
  hasData: boolean;
  earningsPercentage: number;
}

export interface YearStatistics {
  year: number;
  totals: StatisticsTotals;
  months: readonly MonthStatistics[];
}

export interface DayStatistics {
  dateKey: string;
  date: Date;
  dayName: string;
  dayNumber: number;
  outsideMonth: boolean;
  today: boolean;
  hasData: boolean;
  totals: StatisticsTotals;
}

export interface WeekStatistics {
  id: string;
  label: string;
  totals: StatisticsTotals;
  days: readonly DayStatistics[];
}

export interface MonthDrilldown {
  year: number;
  month: number;
  name: string;
  totals: StatisticsTotals;
  weeks: readonly WeekStatistics[];
  topSites: readonly SiteStatisticsTotals[];
}

export interface DaySiteStatistics extends SiteStatisticsTotals {
  rank: number;
}

export interface DayDrilldown {
  dateKey: string;
  label: string;
  totals: StatisticsTotals;
  sites: readonly DaySiteStatistics[];
}

const EMPTY_TOTALS: Readonly<StatisticsTotals> = Object.freeze({
  earnings: 0,
  successes: 0,
  copies: 0,
});

function createTotals(): StatisticsTotals {
  return { ...EMPTY_TOTALS };
}

function addMetrics(target: StatisticsTotals, metrics: RendererDailyMetrics | undefined): void {
  if (!metrics) return;
  target.earnings += metrics.earnings || 0;
  target.successes += metrics.successes || 0;
  target.copies += metrics.copies || 0;
}

function addTotals(target: StatisticsTotals, totals: StatisticsTotals): void {
  target.earnings += totals.earnings;
  target.successes += totals.successes;
  target.copies += totals.copies;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function dateKeyFromDate(date: Date): string {
  return dateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

export function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const result = new Date(year, month, day);
  if (result.getFullYear() !== year || result.getMonth() !== month || result.getDate() !== day) {
    return null;
  }
  return result;
}

export function hasStatisticsData(totals: StatisticsTotals): boolean {
  return totals.earnings !== 0 || totals.successes !== 0 || totals.copies !== 0;
}

export function getDayTotals(snapshot: RendererSnapshot, key: string): StatisticsTotals {
  const totals = createTotals();
  const day = snapshot.dailyState[key];
  if (!day) return totals;

  for (const metrics of Object.values(day)) addMetrics(totals, metrics);
  return totals;
}

export function getDateKeysForMonth(year: number, month: number): readonly string[] {
  const dayCount = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: dayCount }, (_, index) => dateKey(year, month, index + 1));
}

export function getDateKeysForYear(year: number): readonly string[] {
  return Array.from({ length: 12 }, (_, month) => getDateKeysForMonth(year, month)).flat();
}

export function getDateKeysForCurrentWeek(now: Date): readonly string[] {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return dateKeyFromDate(date);
  });
}

export function getMonthTotals(
  snapshot: RendererSnapshot,
  year: number,
  month: number,
): StatisticsTotals {
  const totals = createTotals();
  for (const key of getDateKeysForMonth(year, month))
    addTotals(totals, getDayTotals(snapshot, key));
  return totals;
}

export function getYearTotals(snapshot: RendererSnapshot, year: number): StatisticsTotals {
  const totals = createTotals();
  for (let month = 0; month < 12; month += 1) {
    addTotals(totals, getMonthTotals(snapshot, year, month));
  }
  return totals;
}

function siteName(snapshot: RendererSnapshot, siteId: string): string {
  return snapshot.sites.find((site) => site.id === siteId)?.name ?? siteId;
}

export function getSiteTotalsForKeys(
  snapshot: RendererSnapshot,
  keys: readonly string[],
): readonly SiteStatisticsTotals[] {
  const totalsBySite = new Map<string, SiteStatisticsTotals>();

  for (const key of keys) {
    const day = snapshot.dailyState[key];
    if (!day) continue;

    for (const [siteId, metrics] of Object.entries(day)) {
      let totals = totalsBySite.get(siteId);
      if (!totals) {
        totals = {
          siteId,
          name: siteName(snapshot, siteId),
          earnings: 0,
          successes: 0,
          copies: 0,
        };
        totalsBySite.set(siteId, totals);
      }
      addMetrics(totals, metrics);
    }
  }

  return [...totalsBySite.values()];
}

export function leaderboardDateKeys(
  snapshot: RendererSnapshot,
  period: LeaderboardPeriod,
  now: Date,
): readonly string[] {
  switch (period) {
    case 'weekly':
      return getDateKeysForCurrentWeek(now);
    case 'monthly':
      return getDateKeysForMonth(now.getFullYear(), now.getMonth());
    case 'yearly':
      return getDateKeysForYear(now.getFullYear());
    case 'alltime':
      return Object.keys(snapshot.dailyState);
  }
}

export function buildLeaderboard(
  snapshot: RendererSnapshot,
  metric: LeaderboardMetric,
  period: LeaderboardPeriod,
  now: Date,
): readonly LeaderboardEntry[] {
  const ranked = getSiteTotalsForKeys(snapshot, leaderboardDateKeys(snapshot, period, now))
    .filter((site) => site[metric] > 0)
    .sort((left, right) => {
      const metricDifference = right[metric] - left[metric];
      if (metricDifference !== 0) return metricDifference;
      if (right.earnings !== left.earnings) return right.earnings - left.earnings;
      return left.name.localeCompare(right.name);
    })
    .slice(0, 3);

  const maximum = ranked[0]?.[metric] ?? 1;
  return ranked.map((site, index) => ({
    ...site,
    rank: index + 1,
    value: site[metric],
    percentage: Math.max(0, Math.min(100, Math.round((site[metric] / maximum) * 100))),
  }));
}

export function buildYearStatistics(snapshot: RendererSnapshot, year: number): YearStatistics {
  const months = Array.from({ length: 12 }, (_, month): MonthStatistics => {
    const totals = getMonthTotals(snapshot, year, month);
    return {
      month,
      name: MONTH_NAMES[month] ?? '',
      shortName: (MONTH_NAMES[month] ?? '').slice(0, 3),
      totals,
      hasData: hasStatisticsData(totals),
      earningsPercentage: 0,
    };
  });

  const maximumEarnings = Math.max(1, ...months.map((month) => month.totals.earnings));
  const normalisedMonths = months.map((month) => ({
    ...month,
    earningsPercentage: Math.max(
      0,
      Math.min(100, Math.round((month.totals.earnings / maximumEarnings) * 100)),
    ),
  }));

  const totals = createTotals();
  for (const month of normalisedMonths) addTotals(totals, month.totals);

  return { year, totals, months: normalisedMonths };
}

function weekLabel(days: readonly Date[], weekNumber: number): string {
  const shortMonth = (date: Date): string => (MONTH_NAMES[date.getMonth()] ?? '').slice(0, 3);
  const first = days[0];
  const last = days.at(-1);
  if (!first || !last) return `Week ${weekNumber}`;
  return `Week ${weekNumber} · ${first.getDate()} ${shortMonth(first)} – ${last.getDate()} ${shortMonth(last)}`;
}

export function buildMonthDrilldown(
  snapshot: RendererSnapshot,
  year: number,
  month: number,
  now: Date,
): MonthDrilldown {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const firstMonday = new Date(first);
  firstMonday.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const todayKey = dateKeyFromDate(now);
  const weeks: WeekStatistics[] = [];
  const cursor = new Date(firstMonday);
  let weekNumber = 1;

  while (cursor <= last) {
    const dates = Array.from({ length: 7 }, () => {
      const date = new Date(cursor);
      cursor.setDate(cursor.getDate() + 1);
      return date;
    });
    const totals = createTotals();
    const days = dates.map((date, index): DayStatistics => {
      const key = dateKeyFromDate(date);
      const outsideMonth = date.getMonth() !== month || date.getFullYear() !== year;
      const dayTotals = outsideMonth ? createTotals() : getDayTotals(snapshot, key);
      if (!outsideMonth) addTotals(totals, dayTotals);
      return {
        dateKey: key,
        date,
        dayName: SHORT_DAY_NAMES[index] ?? '',
        dayNumber: date.getDate(),
        outsideMonth,
        today: key === todayKey,
        hasData: !outsideMonth && hasStatisticsData(dayTotals),
        totals: dayTotals,
      };
    });

    weeks.push({
      id: `${year}-${pad(month + 1)}-week-${weekNumber}`,
      label: weekLabel(dates, weekNumber),
      totals,
      days,
    });
    weekNumber += 1;
  }

  const keys = getDateKeysForMonth(year, month);
  const topSites = [...getSiteTotalsForKeys(snapshot, keys)]
    .filter((site) => hasStatisticsData(site))
    .sort((left, right) => {
      if (right.earnings !== left.earnings) return right.earnings - left.earnings;
      if (right.successes !== left.successes) return right.successes - left.successes;
      return right.copies - left.copies;
    })
    .slice(0, 3);

  return {
    year,
    month,
    name: MONTH_NAMES[month] ?? '',
    totals: getMonthTotals(snapshot, year, month),
    weeks,
    topSites,
  };
}

export function buildDayDrilldown(snapshot: RendererSnapshot, key: string): DayDrilldown | null {
  const date = parseDateKey(key);
  if (!date) return null;
  const day = snapshot.dailyState[key] ?? {};
  const sites = Object.entries(day)
    .map(([siteId, metrics]) => ({
      siteId,
      name: siteName(snapshot, siteId),
      earnings: metrics.earnings || 0,
      successes: metrics.successes || 0,
      copies: metrics.copies || 0,
    }))
    .filter((site) => hasStatisticsData(site))
    .sort((left, right) => {
      if (right.earnings !== left.earnings) return right.earnings - left.earnings;
      if (right.successes !== left.successes) return right.successes - left.successes;
      if (right.copies !== left.copies) return right.copies - left.copies;
      return left.name.localeCompare(right.name);
    })
    .map((site, index) => ({ ...site, rank: index + 1 }));

  return {
    dateKey: key,
    label: new Intl.DateTimeFormat('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date),
    totals: getDayTotals(snapshot, key),
    sites,
  };
}
