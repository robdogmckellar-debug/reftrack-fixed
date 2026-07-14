export { buildReferralText, formatReferralDate } from '../../../shared/referral/referral-text';

export function localDateKey(date = new Date()): string {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
