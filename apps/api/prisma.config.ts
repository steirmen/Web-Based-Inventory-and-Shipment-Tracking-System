import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';
import { buildDatabaseUrl } from './src/config/database-url.js';
import { ROOT_ENV_FILE } from './src/config/env.js';

// Prisma does not load .env files itself; use the shared repository-root file.
loadEnv({ path: ROOT_ENV_FILE, quiet: true });

const { DB_HOST, DB_PORT = '5432', DB_NAME, DB_USER, DB_PASSWORD = '' } = process.env;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // `prisma generate` needs no connection, so the URL may be absent (e.g. in CI).
    url:
      DB_HOST && DB_NAME && DB_USER
        ? buildDatabaseUrl({
            host: DB_HOST,
            port: DB_PORT,
            name: DB_NAME,
            user: DB_USER,
            password: DB_PASSWORD,
          })
        : undefined,
  },
});
