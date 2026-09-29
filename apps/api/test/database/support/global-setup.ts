import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import type { TestProject } from 'vitest/node';
import { buildDatabaseUrl, databaseOptionsFromEnv } from '../../../src/config/database-url.js';
import { ROOT_ENV_FILE } from '../../../src/config/env.js';
import { PrismaClient } from '../../../src/generated/prisma/client.js';
import { assertIsTestDatabase, DEFAULT_TEST_DATABASE_NAME } from './test-database-name.js';

const API_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * Prepares the test database once per run: creates it if missing and applies
 * all migrations with `prisma migrate deploy` (non-destructive).
 */
export default async function setup(project: TestProject): Promise<void> {
  loadEnv({ path: ROOT_ENV_FILE, quiet: true });

  const connection = databaseOptionsFromEnv(process.env);
  if (!connection) {
    throw new Error('Database tests need DB_HOST, DB_NAME, and DB_USER. See .env.example.');
  }

  const testDatabaseName = process.env.DB_TEST_NAME || DEFAULT_TEST_DATABASE_NAME;
  assertIsTestDatabase(testDatabaseName, connection.name);

  await createDatabaseIfMissing(
    buildDatabaseUrl({ ...connection, name: 'postgres' }),
    testDatabaseName,
  );
  applyMigrations(testDatabaseName);

  project.provide('databaseUrl', buildDatabaseUrl({ ...connection, name: testDatabaseName }));
}

async function createDatabaseIfMissing(maintenanceUrl: string, name: string): Promise<void> {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: maintenanceUrl }) });
  try {
    const existing = await prisma.$queryRaw<
      unknown[]
    >`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (existing.length === 0) {
      // Identifiers cannot be bound as parameters; `name` is validated by assertIsTestDatabase.
      await prisma.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

function applyMigrations(databaseName: string): void {
  try {
    execSync('npx prisma migrate deploy', {
      cwd: API_ROOT,
      env: { ...process.env, DB_NAME: databaseName },
      stdio: 'pipe',
    });
  } catch (error) {
    const output = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `prisma migrate deploy failed for "${databaseName}":\n${output.stdout?.toString() ?? ''}${output.stderr?.toString() ?? ''}`,
    );
  }
}
