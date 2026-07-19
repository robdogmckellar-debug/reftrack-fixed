import type { SiteUpsertRequest } from '../../../shared/ipc/contract';
import type { RendererSite } from '../../../shared/view-model/renderer-snapshot';
import { buildReferralText } from '../dashboard/link-format';

export const DATE_FORMAT_OPTIONS = [
  { value: '', label: 'No date or time' },
  { value: 'dd/mm hh:MM', label: 'dd/mm hh:MM — 28/06 15:42' },
  { value: 'dd/mm/yyyy hh:MM', label: 'dd/mm/yyyy hh:MM — 28/06/2026 15:42' },
  { value: 'dd/mm/yy hh:MM', label: 'dd/mm/yy hh:MM — 28/06/26 15:42' },
  { value: 'yyyy-dd-mm hh:MM:ss', label: 'yyyy-dd-mm hh:MM:ss — 2026-28-06 15:42:09' },
  { value: 'yyyy-mm-dd hh:MM:ss', label: 'yyyy-mm-dd hh:MM:ss — 2026-06-28 15:42:09' },
  { value: 'dd/mm hh:MM:ss', label: 'dd/mm hh:MM:ss — 28/06 15:42:09' },
  { value: 'dd/mm/yyyy', label: 'dd/mm/yyyy — 28/06/2026' },
  { value: 'mm/dd/yyyy', label: 'mm/dd/yyyy — 06/28/2026' },
  { value: 'hh:MM', label: 'hh:MM — 15:42' },
  { value: 'hh:MM:ss', label: 'hh:MM:ss — 15:42:09' },
  { value: 'unix', label: 'Unix timestamp' },
] as const;

const DATE_FORMATS = new Set<string>(DATE_FORMAT_OPTIONS.map((option) => option.value));

export type SiteEditorField =
  | 'name'
  | 'url'
  | 'prefix'
  | 'suffix'
  | 'dateFormat'
  | 'bonus'
  | 'maxCopiesPerDay'
  | 'notes'
  | 'payoutThreshold'
  | 'appClaimEnabled'
  | 'appClaimDownloadUrl'
  | 'appClaimApkPath'
  | 'appClaimPackageName'
  | 'appClaimDeepLinkUrl'
  | 'appClaimAvdName';

export interface SiteEditorDraft {
  name: string;
  url: string;
  prefix: string;
  suffix: string;
  dateFormat: string;
  bonus: string;
  maxCopiesPerDay: string;
  notes: string;
  payoutThreshold: string;
  appClaimEnabled: boolean;
  appClaimDownloadUrl: string;
  appClaimApkPath: string;
  appClaimPackageName: string;
  appClaimDeepLinkUrl: string;
  appClaimAvdName: string;
}

export interface SiteEditorValidation {
  errors: Partial<Record<SiteEditorField, string>>;
  firstInvalidField: SiteEditorField | null;
  request: SiteUpsertRequest | null;
}

export function createEmptySiteDraft(): SiteEditorDraft {
  return {
    name: '',
    url: '',
    prefix: '',
    suffix: '',
    dateFormat: '',
    bonus: '',
    maxCopiesPerDay: '1',
    notes: '',
    payoutThreshold: '0.00',
    appClaimEnabled: false,
    appClaimDownloadUrl: '',
    appClaimApkPath: '',
    appClaimPackageName: '',
    appClaimDeepLinkUrl: '',
    appClaimAvdName: '',
  };
}

export function siteToDraft(site: RendererSite): SiteEditorDraft {
  return {
    name: site.name,
    url: site.url,
    prefix: site.prefix,
    suffix: site.suffix,
    dateFormat: site.dateFormat,
    bonus: site.bonus.toFixed(2),
    maxCopiesPerDay: String(site.maxCopiesPerDay),
    notes: site.notes ?? '',
    payoutThreshold: (site.payoutThreshold ?? 0).toFixed(2),
    appClaimEnabled: site.appClaim?.enabled ?? false,
    appClaimDownloadUrl: site.appClaim?.downloadUrl ?? '',
    appClaimApkPath: site.appClaim?.apkPath ?? '',
    appClaimPackageName: site.appClaim?.packageName ?? '',
    appClaimDeepLinkUrl: site.appClaim?.deepLinkUrl ?? '',
    appClaimAvdName: site.appClaim?.avdName ?? '',
  };
}

export function sameSiteDraft(left: SiteEditorDraft, right: SiteEditorDraft): boolean {
  return (
    left.name === right.name &&
    left.url === right.url &&
    left.prefix === right.prefix &&
    left.suffix === right.suffix &&
    left.dateFormat === right.dateFormat &&
    left.bonus === right.bonus &&
    left.maxCopiesPerDay === right.maxCopiesPerDay &&
    left.notes === right.notes &&
    left.payoutThreshold === right.payoutThreshold &&
    left.appClaimEnabled === right.appClaimEnabled &&
    left.appClaimDownloadUrl === right.appClaimDownloadUrl &&
    left.appClaimApkPath === right.appClaimApkPath &&
    left.appClaimPackageName === right.appClaimPackageName &&
    left.appClaimDeepLinkUrl === right.appClaimDeepLinkUrl &&
    left.appClaimAvdName === right.appClaimAvdName
  );
}

export function buildSiteDraftPreview(draft: SiteEditorDraft, date = new Date()): string {
  return buildReferralText(
    {
      prefix: draft.prefix,
      url: draft.url,
      dateFormat: draft.dateFormat,
      suffix: draft.suffix,
    },
    date,
  );
}

export function validateSiteDraft(draft: SiteEditorDraft, id: string | null): SiteEditorValidation {
  const errors: Partial<Record<SiteEditorField, string>> = {};
  const name = draft.name.trim();
  const url = draft.url.trim();
  const prefix = draft.prefix.trim();
  const suffix = draft.suffix.trim();
  const bonusText = draft.bonus.trim();
  const maxCopiesText = draft.maxCopiesPerDay.trim();
  const notes = draft.notes ?? '';
  const payoutThresholdText = draft.payoutThreshold ?? '0';
  const appClaimDownloadUrl = (draft.appClaimDownloadUrl ?? '').trim();
  const appClaimApkPath = (draft.appClaimApkPath ?? '').trim();
  const appClaimPackageName = (draft.appClaimPackageName ?? '').trim();
  const appClaimDeepLinkUrl = (draft.appClaimDeepLinkUrl ?? '').trim();
  const appClaimAvdName = (draft.appClaimAvdName ?? '').trim();

  if (!name) errors.name = 'Enter a site name.';
  else if (name.length > 100) errors.name = 'Use 100 characters or fewer.';

  if (url.length > 2048) errors.url = 'Use 2,048 characters or fewer.';
  else if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
        errors.url = 'Use a credential-free HTTPS URL.';
      }
    } catch {
      errors.url = 'Enter a valid HTTPS URL.';
    }
  }

  if (draft.prefix.length > 500) errors.prefix = 'Use 500 characters or fewer.';
  if (draft.suffix.length > 500) errors.suffix = 'Use 500 characters or fewer.';
  if (notes.length > 4000) errors.notes = 'Use 4,000 characters or fewer.';
  if (!DATE_FORMATS.has(draft.dateFormat)) errors.dateFormat = 'Choose a supported format.';

  const bonus = Number(bonusText);
  if (!bonusText) errors.bonus = 'Enter a bonus amount. Zero is allowed.';
  else if (!Number.isFinite(bonus) || bonus < 0) errors.bonus = 'Enter a non-negative amount.';
  else if (!Number.isSafeInteger(Math.round(bonus * 100))) {
    errors.bonus = 'The amount is too large.';
  } else if (!/^\d+(?:\.\d{0,2})?$/.test(bonusText)) {
    errors.bonus = 'Use no more than two decimal places.';
  }

  const maxCopiesPerDay = Number(maxCopiesText);
  if (!maxCopiesText) errors.maxCopiesPerDay = 'Enter a daily copy limit.';
  else if (!Number.isSafeInteger(maxCopiesPerDay) || maxCopiesPerDay < 0) {
    errors.maxCopiesPerDay = 'Enter a whole number from 0 to 1,000.';
  } else if (maxCopiesPerDay > 1000) {
    errors.maxCopiesPerDay = 'The maximum supported limit is 1,000.';
  }

  const payoutThreshold = Number(payoutThresholdText);
  if (!payoutThresholdText) errors.payoutThreshold = 'Enter a threshold. Zero disables it.';
  else if (!Number.isFinite(payoutThreshold) || payoutThreshold < 0) {
    errors.payoutThreshold = 'Enter a non-negative amount.';
  } else if (!Number.isSafeInteger(Math.round(payoutThreshold * 100))) {
    errors.payoutThreshold = 'The amount is too large.';
  } else if (!/^\d+(?:\.\d{0,2})?$/.test(payoutThresholdText)) {
    errors.payoutThreshold = 'Use no more than two decimal places.';
  }

  if (appClaimDownloadUrl) {
    validateCredentialFreeUrl(appClaimDownloadUrl, 'appClaimDownloadUrl', errors);
  }
  if (appClaimApkPath.length > 32767) {
    errors.appClaimApkPath = 'Use 32,767 characters or fewer.';
  } else if (appClaimApkPath && !appClaimApkPath.toLowerCase().endsWith('.apk')) {
    errors.appClaimApkPath = 'Choose an APK file.';
  }
  if (
    appClaimPackageName &&
    !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(appClaimPackageName)
  ) {
    errors.appClaimPackageName = 'Enter a valid Android package name.';
  }
  if (appClaimDeepLinkUrl) {
    validateAppClaimLink(appClaimDeepLinkUrl, 'appClaimDeepLinkUrl', errors);
  }
  if (
    appClaimAvdName &&
    (appClaimAvdName.length > 160 ||
      appClaimAvdName.startsWith('-') ||
      appClaimAvdName.includes('/') ||
      appClaimAvdName.includes('\\') ||
      appClaimAvdName.includes('\0'))
  ) {
    errors.appClaimAvdName = 'Enter a valid Android emulator AVD name.';
  }

  const fieldOrder: readonly SiteEditorField[] = [
    'name',
    'bonus',
    'maxCopiesPerDay',
    'payoutThreshold',
    'url',
    'prefix',
    'suffix',
    'dateFormat',
    'notes',
    'appClaimDownloadUrl',
    'appClaimApkPath',
    'appClaimPackageName',
    'appClaimDeepLinkUrl',
    'appClaimAvdName',
  ];
  const firstInvalidField = fieldOrder.find((field) => errors[field]) ?? null;

  if (firstInvalidField) return { errors, firstInvalidField, request: null };

  return {
    errors,
    firstInvalidField: null,
    request: {
      id,
      name: name.toUpperCase(),
      url,
      prefix,
      suffix,
      dateFormat: draft.dateFormat,
      bonusCents: Math.round(bonus * 100),
      maxCopiesPerDay,
      notes: notes.trim(),
      payoutThresholdCents: Math.round(payoutThreshold * 100),
      appClaim: {
        enabled: draft.appClaimEnabled ?? false,
        downloadUrl: appClaimDownloadUrl,
        apkPath: appClaimApkPath || null,
        packageName: appClaimPackageName,
        deepLinkUrl: appClaimDeepLinkUrl,
        avdName: appClaimAvdName,
      },
    },
  };
}

function validateCredentialFreeUrl(
  value: string,
  field: SiteEditorField,
  errors: Partial<Record<SiteEditorField, string>>,
): void {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      errors[field] = 'Use a credential-free HTTPS URL.';
    }
  } catch {
    errors[field] = 'Enter a valid HTTPS URL.';
  }
}

function validateAppClaimLink(
  value: string,
  field: SiteEditorField,
  errors: Partial<Record<SiteEditorField, string>>,
): void {
  try {
    const parsed = new URL(value);
    if (
      !['https:', 'http:', 'intent:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    ) {
      errors[field] = 'Enter a valid app or web link.';
    }
  } catch {
    errors[field] = 'Enter a valid app or web link.';
  }
}
