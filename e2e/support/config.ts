import { fileURLToPath } from 'node:url';

/**
 * The E2E stack runs beside (never instead of) the development servers:
 * its own ports, its own production build, its own database.
 */
export const API_PORT = 3100;
export const WEB_PORT = 5174;
export const API_URL = `http://localhost:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

/** Dedicated database; recreated from scratch on every run. Must end in "_test". */
export const E2E_DATABASE = 'app_e2e_test';

/** Test-only password of every seeded user (E2E database only). */
export const PASSWORD = 'E2e-Password-2026!';

export const USERS = {
  owner: { email: 'owner@e2e.test', name: 'Olivia Owner' },
  admin: { email: 'admin@e2e.test', name: 'Adam Admin' },
  staff: { email: 'staff@e2e.test', name: 'Sam Staff' },
  /** Member of Beta only (isolation). */
  other: { email: 'other@e2e.test', name: 'Oscar Other' },
  /** Signs in through the form in the auth tests (no prepared session). */
  login: { email: 'login@e2e.test', name: 'Lena Login' },
  /** Appearance tests: two users who must never see each other's appearance. */
  styleA: { email: 'style.a@e2e.test', name: 'Stella Style' },
  styleB: { email: 'style.b@e2e.test', name: 'Bruno Plain' },
} as const;
export type UserKey = keyof typeof USERS;

/** Users that get a ready-made session (Playwright storage state). */
export const SESSION_USERS = ['owner', 'admin', 'staff', 'other', 'styleA'] as const;
export type SessionUser = (typeof SESSION_USERS)[number];

export const ORGS = {
  acme: { name: 'Acme E2E', slug: 'acme-e2e' },
  beta: { name: 'Beta E2E', slug: 'beta-e2e' },
} as const;

export const E2E_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const AUTH_DIR = fileURLToPath(new URL('../.auth/', import.meta.url));
export const storageStateOf = (user: SessionUser) => `${AUTH_DIR}${user}.json`;
export const SEED_FILE = `${AUTH_DIR}seed.json`;
