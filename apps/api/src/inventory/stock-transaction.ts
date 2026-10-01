import { isConcurrencyConflict } from '../common/errors/prisma-errors.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { inventoryConcurrencyConflict } from './inventory-errors.js';

/** Row locks may make a request wait for a concurrent one; allow for that. */
const STOCK_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 15_000 };

/**
 * The transaction boundary of every stock-changing operation (Phase 6 stock
 * operations and Phase 7A order fulfillment): all reads, locks, checks, and
 * writes run inside `work`, and either all commit or none do. A lost lock race
 * (deadlock, lock or transaction timeout) — which the fixed lock order makes
 * unlikely — answers 409 INVENTORY_CONCURRENCY_CONFLICT instead of a generic 500.
 */
export async function runStockTransaction<T>(
  prisma: PrismaService,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(work, STOCK_TRANSACTION_OPTIONS);
  } catch (error) {
    if (isConcurrencyConflict(error)) throw inventoryConcurrencyConflict();
    throw error;
  }
}
