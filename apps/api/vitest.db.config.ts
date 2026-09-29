import { defineConfig } from 'vitest/config';

/**
 * Database integration tests (`npm run test:db`).
 *
 * Runs against a dedicated PostgreSQL test database (DB_TEST_NAME, default
 * `app_test`) — never the development database. The global setup creates the
 * database if needed and applies migrations; every test starts from empty tables.
 */
export default defineConfig({
  test: {
    include: ['test/database/**/*.db-spec.ts'],
    environment: 'node',
    globalSetup: ['test/database/support/global-setup.ts'],
    setupFiles: ['test/database/support/setup.ts'],
    // Tests share one database and truncate it between tests: run files serially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
