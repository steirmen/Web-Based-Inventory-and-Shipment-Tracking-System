import { describe, expect, it } from 'vitest';
import { stockStatus } from './inventory-mappers.js';

describe('stockStatus (per warehouse)', () => {
  it.each([
    // minimumStock = 10
    ['warehouse A', 7, 10, 'LOW_STOCK'],
    ['warehouse B (exactly the minimum)', 10, 10, 'LOW_STOCK'],
    ['warehouse C', 0, 10, 'OUT_OF_STOCK'],
    ['warehouse D', 15, 10, 'IN_STOCK'],
    // No reorder level: anything on hand is in stock.
    ['no minimum, some stock', 1, 0, 'IN_STOCK'],
    ['no minimum, none', 0, 0, 'OUT_OF_STOCK'],
  ] as const)('%s: %i units, minimum %i → %s', (_label, quantity, minimum, expected) => {
    expect(stockStatus(quantity, minimum)).toBe(expected);
  });
});
