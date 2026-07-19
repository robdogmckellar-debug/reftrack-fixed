import type { SiteId } from './site';

export type PayoutId = string;

export interface PayoutEntry {
  id: PayoutId;
  siteId: SiteId;
  amountCents: number;
  expectedDate: string;
  paidAt: string | null;
  createdAt: string;
  note: string;
}
