import type { SiteId } from './site';

export interface DailySiteMetrics {
  copies: number;
  successes: number;
  earningsCents: number;
}

export type DailySiteRecord = Record<SiteId, DailySiteMetrics>;
export type DailyRecords = Record<string, DailySiteRecord>;
