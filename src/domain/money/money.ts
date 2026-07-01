export function dollarsToCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function centsToDollars(value: number): number {
  if (!Number.isSafeInteger(value)) return 0;
  return value / 100;
}
