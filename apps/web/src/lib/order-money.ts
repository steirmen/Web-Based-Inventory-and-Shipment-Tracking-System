/**
 * Exact money arithmetic for order PREVIEWS in the browser: decimal strings
 * are converted to integer cents (BigInt), multiplied by whole quantities,
 * summed, and turned back into decimal strings. No Number()/parseFloat on
 * money — "0.10" × 3 is exactly "0.30". The server computes the real totals.
 */

const MONEY = /^(\d+)(?:\.(\d{1,2}))?$/;

export function toCents(value: string): bigint {
  const match = MONEY.exec(value.trim());
  if (!match) throw new Error(`Not a money amount: ${value}`);
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
}

export function fromCents(cents: bigint): string {
  const whole = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, '0');
  return `${whole}.${fraction}`;
}

/** unitPrice × quantity as a decimal string ("24.99" × 2 → "49.98"). */
export function lineTotal(unitPrice: string, quantity: number): string {
  return fromCents(toCents(unitPrice) * BigInt(quantity));
}

export function sumMoney(values: string[]): string {
  return fromCents(values.reduce((sum, value) => sum + toCents(value), 0n));
}
