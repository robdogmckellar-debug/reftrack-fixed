export type SiteId = string;

export interface Site {
  id: SiteId;
  name: string;
  url: string;
  prefix: string;
  suffix: string;
  dateFormat: string;
  bonusCents: number;
  maxCopiesPerDay: number;
}
