/**
 * Small helpers for the dashboard's SVG charts. Money stays exact: decimal
 * strings are parsed into integer CENTS (BigInt), never into floating-point
 * amounts. Only whole-cent integers become numbers, for bar geometry.
 */

const MONEY = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/** "1234.5" → 123450n. Throws on anything that isn't a plain decimal string. */
export function toCents(value: string): bigint {
  const match = MONEY.exec(value);
  if (!match) throw new Error(`Not a decimal amount: ${value}`);
  const [, sign, whole, fraction = ''] = match;
  const cents = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  return sign ? -cents : cents;
}

/** 123450n → "1234.50" (for formatMoney). */
export function centsToDecimal(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

export interface Scale {
  /** Top of the axis (≥ every value, ≥ one step). */
  max: number;
  ticks: number[];
}

/**
 * A "nice" integer axis from 0 to at least `maxValue`, with roughly `count`
 * steps of 1, 2, 2.5, or 5 × 10ⁿ (never below 1, so counts stay whole).
 */
export function niceScale(maxValue: number, count = 4): Scale {
  const top = Math.max(maxValue, 1);
  const raw = top / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const factor =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  const step = Math.max(1, Math.round(factor * magnitude));
  const max = Math.ceil(top / step) * step;
  const ticks: number[] = [];
  for (let tick = 0; tick <= max; tick += step) ticks.push(tick);
  return { max, ticks };
}

/** Indexes of the x-axis labels to show so at most `maxLabels` fit (always the first). */
export function labelIndexes(count: number, maxLabels: number): number[] {
  if (count === 0) return [];
  const every = Math.max(1, Math.ceil(count / Math.max(1, maxLabels)));
  const indexes: number[] = [];
  for (let index = 0; index < count; index += every) indexes.push(index);
  return indexes;
}

/** Share of `part` in `total` as a whole percentage (0 when total is 0). */
export function percentOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}
