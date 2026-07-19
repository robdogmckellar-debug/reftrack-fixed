export type SiteId = string;
export type SiteLifecycle = 'active' | 'archived' | 'trashed';

export interface SiteAppClaim {
  enabled: boolean;
  downloadUrl: string;
  apkPath: string | null;
  packageName: string;
  deepLinkUrl: string;
  avdName: string;
}

export interface Site {
  id: SiteId;
  name: string;
  url: string;
  prefix: string;
  suffix: string;
  dateFormat: string;
  bonusCents: number;
  maxCopiesPerDay: number;
  notes?: string;
  lifecycle?: SiteLifecycle;
  lifecycleChangedAt?: string | null;
  payoutThresholdCents?: number;
  appClaim?: SiteAppClaim;
}
