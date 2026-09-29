import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';
import { buildDatabaseUrl, databaseOptionsFromEnv } from './src/config/database-url.js';
import { ROOT_ENV_FILE } from './src/config/env.js';

// Prisma does not load .env files itself; use the shared repository-root file.
// Variables already set in the environment win (the database tests use this to
// point the CLI at the test database).
loadEnv({ path: ROOT_ENV_FILE, quiet: true });

const database = databaseOptionsFromEnv(process.env);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` needs no connection, so the URL may be absent (e.g. in CI).
    url: database ? buildDatabaseUrl(database) : undefined,
  },
});
