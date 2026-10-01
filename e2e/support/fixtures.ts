import { readFileSync } from 'node:fs';
import {
  type APIRequestContext,
  test as base,
  type BrowserContext,
  expect,
  type Page,
  request,
} from '@playwright/test';
import { API_URL, SEED_FILE, type SessionUser, storageStateOf, WEB_URL } from './config.js';
import { closeDb } from './db.js';

/** Ids written by prepare-db.ts and the seed project. */
export interface SeedData {
  users: Record<string, string>;
  acme: string;
  beta: string;
  products: Record<string, string>;
  categories: Record<string, string>;
  warehouses: Record<string, string>;
  customers: Record<string, string>;
  orders: Record<string, { id: string; number: string }>;
  betaIds: { product: string; customer: string; warehouse: string };
}

export const seed = (): SeedData => JSON.parse(readFileSync(SEED_FILE, 'utf8')) as SeedData;

/** API client of a signed-in user: sends the web app's Origin, like the browser does. */
export function apiAs(user: SessionUser): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: API_URL,
    storageState: storageStateOf(user),
    extraHTTPHeaders: { Origin: WEB_URL },
  });
}

interface Fixtures {
  /** A page in a fresh browser context signed in as `user` (several users per test are fine). */
  pageAs: (user: SessionUser) => Promise<Page>;
  /** The API as `user` (direct calls, e.g. to prove the server refuses what the UI hides). */
  apiAs: (user: SessionUser) => Promise<APIRequestContext>;
  data: SeedData;
}

export const test = base.extend<Fixtures>({
  pageAs: async ({ browser, locale, timezoneId, viewport, reducedMotion }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async (user) => {
      // Same emulation as the test's own page (locale, time zone, viewport, motion).
      const context = await browser.newContext({
        storageState: storageStateOf(user),
        locale,
        timezoneId,
        viewport,
        reducedMotion,
      });
      contexts.push(context);
      return context.newPage();
    });
    for (const context of contexts) await context.close();
  },
  // oxlint-disable-next-line no-empty-pattern -- Playwright fixtures destructure their dependencies
  apiAs: async ({}, use) => {
    const clients: APIRequestContext[] = [];
    await use(async (user) => {
      const client = await apiAs(user);
      clients.push(client);
      return client;
    });
    for (const client of clients) await client.dispose();
  },
  // oxlint-disable-next-line no-empty-pattern -- Playwright fixtures destructure their dependencies
  data: async ({}, use) => {
    await use(seed());
  },
});

test.afterAll(async () => {
  await closeDb();
});

export { expect };

/** The app path of a workspace page. */
export const orgPath = (organizationId: string, path = '') => `/org/${organizationId}${path}`;

/** No document-level horizontal scrolling (the page itself never scrolls sideways). */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}
