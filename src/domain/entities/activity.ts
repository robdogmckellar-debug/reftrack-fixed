import type { SiteId } from './site';

export type ActivityType = 'copy' | 'success' | 'delete';

export interface ActivityEntry {
  id: string;
  occurredAt: string;
  type: ActivityType;
  siteId: SiteId | null;
  siteName: string;
  amountCents: number | null;
}
