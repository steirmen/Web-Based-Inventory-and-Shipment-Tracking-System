import { canTransition, ORDER_STATUSES, type OrderStatus } from '@app/shared';
import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { orderTotals } from './order-totals.js';

describe('order state machine', () => {
  /** The complete list of allowed transitions; everything else must be rejected. */
  const allowed = new Set([
    'DRAFT>CONFIRMED',
    'DRAFT>CANCELLED',
    'CONFIRMED>PROCESSING',
    'CONFIRMED>CANCELLED',
    'PROCESSING>SHIPPED',
    'SHIPPED>COMPLETED',
  ]);

  for (const from of ORDER_STATUSES) {
    for (const to of ORDER_STATUSES) {
      const expected = allowed.has(`${from}>${to}`);
      it(`${from} → ${to} is ${expected ? 'allowed' : 'rejected'}`, () => {
        expect(canTransition(from as OrderStatus, to as OrderStatus)).toBe(expected);
      });
    }
  }

  it('never allows cancelling once stock was deducted (PROCESSING or later)', () => {
    for (const from of ['PROCESSING', 'SHIPPED', 'COMPLETED'] as const) {
      expect(canTransition(from, 'CANCELLED')).toBe(false);
    }
  });
});

describe('orderTotals', () => {
  const line = (unitPrice: string, quantity: number) => ({
    unitPrice: new Prisma.Decimal(unitPrice),
    quantity,
  });

  it('multiplies and sums exactly (no binary floating point)', () => {
    const { lineTotals, subtotal, total } = orderTotals([
      line('0.10', 3),
      line('0.20', 1),
      line('24.99', 7),
    ]);

    expect(lineTotals.map((value) => value.toFixed(2))).toEqual(['0.30', '0.20', '174.93']);
    expect(subtotal.toFixed(2)).toBe('175.43');
    expect(total.equals(subtotal)).toBe(true);
    // The float version would be 0.30000000000000004 for the first line.
    expect(0.1 * 3).not.toBe(0.3);
  });

  it('is zero for an empty order', () => {
    expect(orderTotals([]).total.toFixed(2)).toBe('0.00');
  });

  it('rejects totals that do not fit NUMERIC(14,2)', () => {
    expect(() => orderTotals([line('9999999999.99', 1_000_000)])).toThrow(
      expect.objectContaining({ code: 'ORDER_TOTAL_LIMIT' }),
    );
    expect(orderTotals([line('999999999.99', 1000)]).total.toFixed(2)).toBe('999999999990.00');
  });
});
