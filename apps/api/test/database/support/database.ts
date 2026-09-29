import { PrismaPg } from '@prisma/adapter-pg';
import { inject } from 'vitest';
import { PrismaClient } from '../../../src/generated/prisma/client.js';
import { assertIsTestDatabase } from './test-database-name.js';

/** Prisma client connected to the test database. One instance per test file. */
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: inject('databaseUrl') }),
});

/** Empties every application table. Refuses to run against a non-test database. */
export async function resetDatabase(): Promise<void> {
  const [{ name }] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  assertIsTestDatabase(name);

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length > 0) {
    const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
  }
}
