import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    environment: 'node',
    // Tests must not depend on a developer's local `.env`. These values satisfy
    // config validation; tests that touch the database mock PrismaService.
    env: {
      NODE_ENV: 'test',
      API_PORT: '3999',
      API_CORS_ORIGINS: 'http://localhost:5173',
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_NAME: 'app_test',
      DB_USER: 'postgres',
      DB_PASSWORD: 'test',
    },
  },
});
