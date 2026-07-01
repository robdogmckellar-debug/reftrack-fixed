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
  'name' | 'url' | 'prefix' | 'suffix' | 'dateFormat' | 'bonus' | 'maxCopiesPerDay';

export interface SiteEditorDraft {
  name: string;
  url: string;
  prefix: string;
  suffix: string;
  dateFormat: string;
  bonus: string;
  maxCopiesPerDay: string;
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
    left.maxCopiesPerDay === right.maxCopiesPerDay
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

  const fieldOrder: readonly SiteEditorField[] = [
    'name',
    'bonus',
    'maxCopiesPerDay',
    'url',
    'prefix',
    'suffix',
    'dateFormat',
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
    },
  };
}
