import { defineConfig, devices } from '@playwright/test';
import { API_PORT, API_URL, E2E_DATABASE, REPO_ROOT, WEB_PORT, WEB_URL } from './support/config.js';

/**
 * Real-browser E2E (Phase 10B). Runs the installed Microsoft Edge (no browser
 * download) against a production-like stack started here:
 *
 * - API: the compiled API (`apps/api/dist`, built by `npm run test:e2e`) on
 *   :3100, after `prepare-db.ts` recreated the dedicated `app_e2e_test` database;
 * - web: a production build served by `vite preview` on :5174 (real CSP headers).
 *
 * The development servers (:3000/:5173) and database are never used. Tests run
 * serially: they share one seeded database and the per-IP login rate limit.
 */
export default defineConfig({
  testDir: '.',
  outputDir: './test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  globalTeardown: './support/global-teardown.ts',
  use: {
    baseURL: WEB_URL,
    channel: 'msedge',
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'seed', testMatch: /support\/seed\.setup\.ts/ },
    {
      name: 'edge',
      testMatch: /tests\/.*\.spec\.ts/,
      dependencies: ['seed'],
      use: {
        ...devices['Desktop Edge'],
        channel: 'msedge',
        viewport: { width: 1440, height: 900 },
        // The installed Edge takes Intl's default locale from its UI language, not from
        // Playwright's locale emulation: pin it so number and date formats are deterministic.
        launchOptions: { args: ['--lang=en-US'] },
      },
    },
  ],
  webServer: [
    {
      command: 'npx tsx e2e/support/prepare-db.ts && node apps/api/dist/main.js',
      cwd: REPO_ROOT,
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        NODE_ENV: 'test',
        API_PORT: String(API_PORT),
        API_CORS_ORIGINS: WEB_URL,
        API_TRUST_PROXY: 'false',
        AUTH_COOKIE_SECURE: 'false',
        WEB_APP_URL: WEB_URL,
        DB_NAME: E2E_DATABASE,
      },
    },
    {
      command: `npx vite build --outDir dist-e2e --emptyOutDir --logLevel warn && npx vite preview --outDir dist-e2e --port ${WEB_PORT} --strictPort`,
      cwd: `${REPO_ROOT}apps/web`,
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: { NODE_ENV: 'production', VITE_API_BASE_URL: API_URL },
    },
  ],
});
