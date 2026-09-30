import { Prisma } from '../../generated/prisma/client.js';

/** True for a unique-constraint violation (Prisma P2002). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** True when a foreign key blocks the write or delete (Prisma P2003; includes ON DELETE RESTRICT). */
export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

/** SQLSTATEs of lost lock races: deadlock, serialization failure, lock timeout. */
const CONCURRENCY_SQLSTATES = new Set(['40P01', '40001', '55P03']);

/**
 * True when a transaction failed because of a concurrent transaction rather
 * than its own data: a deadlock or serialization failure (Prisma P2034, or the
 * raw SQLSTATE from the driver adapter), a lock timeout, or an interactive
 * transaction that could not start or finish in time (P2028). The transaction
 * was rolled back, so nothing was written.
 */
export function isConcurrencyConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2034' || error.code === 'P2028') return true;
  const meta = error.meta as
    { code?: unknown; driverAdapterError?: { cause?: { originalCode?: unknown } } } | undefined;
  const sqlState = meta?.driverAdapterError?.cause?.originalCode ?? meta?.code;
  return typeof sqlState === 'string' && CONCURRENCY_SQLSTATES.has(sqlState);
}
