import { expect } from 'vitest';

/** PostgreSQL SQLSTATE codes asserted by the database tests. */
const SqlState = {
  UniqueViolation: '23505',
  ForeignKeyViolation: '23503',
  CheckViolation: '23514',
  /** Raised by ON DELETE RESTRICT (NO ACTION would raise 23503 instead). */
  RestrictViolation: '23001',
} as const;

type SqlStateCode = (typeof SqlState)[keyof typeof SqlState];

interface DriverErrorCause {
  originalCode?: string;
  originalMessage?: string;
}

/** Prisma 7 driver-adapter errors carry the raw PostgreSQL error in `meta.driverAdapterError.cause`. */
function driverCause(error: unknown): DriverErrorCause | undefined {
  if (typeof error !== 'object' || error === null || !('meta' in error)) {
    return undefined;
  }
  const { meta } = error as { meta?: { driverAdapterError?: { cause?: DriverErrorCause } } };
  return meta?.driverAdapterError?.cause;
}

async function expectConstraintViolation(
  operation: PromiseLike<unknown>,
  code: SqlStateCode,
  constraint?: string,
): Promise<void> {
  const error = await Promise.resolve(operation).then(
    () => undefined,
    (reason: unknown) => reason,
  );

  if (error === undefined) {
    throw new Error(
      `Expected the operation to violate ${constraint ?? `SQLSTATE ${code}`}, but it succeeded.`,
    );
  }

  const cause = driverCause(error);
  // Compare as one object so a failure shows both the SQLSTATE and the database message.
  expect({ code: cause?.originalCode, message: cause?.originalMessage ?? String(error) }).toEqual({
    code,
    message: constraint ? expect.stringContaining(`"${constraint}"`) : expect.any(String),
  });
}

export const expectUniqueViolation = (operation: PromiseLike<unknown>, constraint: string) =>
  expectConstraintViolation(operation, SqlState.UniqueViolation, constraint);

export const expectCheckViolation = (operation: PromiseLike<unknown>, constraint: string) =>
  expectConstraintViolation(operation, SqlState.CheckViolation, constraint);

/** Inserting/updating a row that references a missing (or other-tenant) parent. */
export const expectForeignKeyViolation = (operation: PromiseLike<unknown>, constraint: string) =>
  expectConstraintViolation(operation, SqlState.ForeignKeyViolation, constraint);

/**
 * Deleting a parent that is still referenced through an ON DELETE RESTRICT key.
 * `constraint` is optional because PostgreSQL reports whichever referencing key it checks first.
 */
export const expectRestrictViolation = (operation: PromiseLike<unknown>, constraint?: string) =>
  expectConstraintViolation(operation, SqlState.RestrictViolation, constraint);
