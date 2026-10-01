import { ORDER_LIMITS } from '@app/shared';
import { Prisma } from '../generated/prisma/client.js';
import { orderTotalLimit } from './order-errors.js';

const TOTAL_MAX = new Prisma.Decimal(ORDER_LIMITS.totalMax);

export interface PricedLine {
  unitPrice: Prisma.Decimal;
  quantity: number;
}

/**
 * The whole total model: lineTotal = unitPrice × quantity, subtotal = Σ lineTotal,
 * total = subtotal (no taxes, discounts, or shipping). Exact decimal arithmetic —
 * prices have 2 decimals and quantities are integers, so no rounding happens.
 * Anything that would not fit NUMERIC(14,2) is rejected (422 ORDER_TOTAL_LIMIT).
 */
export function orderTotals(lines: PricedLine[]): {
  lineTotals: Prisma.Decimal[];
  subtotal: Prisma.Decimal;
  total: Prisma.Decimal;
} {
  const lineTotals = lines.map((line) => line.unitPrice.mul(line.quantity));
  const subtotal = lineTotals.reduce((sum, value) => sum.add(value), new Prisma.Decimal(0));
  if (subtotal.greaterThan(TOTAL_MAX)) throw orderTotalLimit();
  return { lineTotals, subtotal, total: subtotal };
}
