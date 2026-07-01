import type { RendererSite } from '../../../shared/view-model/renderer-snapshot';

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

export function localDateKey(date = new Date()): string {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-');
}

export function formatReferralDate(format: string, date = new Date()): string {
  if (!format) return '';
  if (format === 'unix') return String(Math.floor(date.getTime() / 1000));

  const year = String(date.getFullYear());
  const replacements: ReadonlyArray<readonly [string, string]> = [
    ['yyyy', year],
    ['yy', year.slice(-2)],
    ['dd', pad(date.getDate())],
    ['mm', pad(date.getMonth() + 1)],
    ['hh', pad(date.getHours())],
    ['MM', pad(date.getMinutes())],
    ['ss', pad(date.getSeconds())],
  ];

  return replacements.reduce((result, [token, value]) => result.replaceAll(token, value), format);
}

export function buildReferralText(
  site: Pick<RendererSite, 'prefix' | 'url' | 'dateFormat' | 'suffix'>,
  date = new Date(),
): string {
  return [site.prefix, site.url, formatReferralDate(site.dateFormat, date), site.suffix]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}
