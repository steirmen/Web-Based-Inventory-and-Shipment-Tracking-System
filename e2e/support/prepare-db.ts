/**
 * Prepares the E2E database before the API starts (run by Playwright's
 * webServer command via tsx):
 *
 *   1. refuses any database whose name doesn't end in "_test" or equals DB_NAME;
 *   2. creates `app_e2e_test` if missing and applies all migrations (deploy);
 *   3. empties every table (deterministic start, no leftovers from earlier runs);
 *   4. seeds users, two workspaces, and memberships, and gives the E2E users a
 *      ready-made session (Playwright storage state), so tests don't have to
 *      sign in through the rate-limited login form.
 *
 * Business data (catalog, stock, orders) is created through the real API by
 * the `seed` setup project. Nothing here touches the development database.
 */
import { execSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { parse } from 'dotenv';
import { hashPassword } from '../../apps/api/src/auth/password/password-hashing.js';
import {
  buildDatabaseUrl,
  databaseOptionsFromEnv,
} from '../../apps/api/src/config/database-url.js';
import { ROOT_ENV_FILE } from '../../apps/api/src/config/env.js';
import { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';
import {
  AUTH_DIR,
  E2E_DATABASE,
  ORGS,
  PASSWORD,
  REPO_ROOT,
  SEED_FILE,
  SESSION_USERS,
  storageStateOf,
  USERS,
  type UserKey,
} from './config.js';

// Credentials come from the repository .env; the database name is always the E2E one.
const fileEnv = existsSync(ROOT_ENV_FILE) ? parse(readFileSync(ROOT_ENV_FILE)) : {};
const developmentName = fileEnv.DB_NAME;
const connection = databaseOptionsFromEnv({ ...fileEnv, ...process.env, DB_NAME: E2E_DATABASE });
if (!connection) throw new Error('E2E needs DB_HOST, DB_USER (and DB_PASSWORD) in .env.');
if (!/_test$/.test(E2E_DATABASE) || E2E_DATABASE === developmentName) {
  throw new Error(`Refusing to use "${E2E_DATABASE}" for E2E tests.`);
}

async function createDatabaseIfMissing(): Promise<void> {
  const admin = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: buildDatabaseUrl({ ...connection!, name: 'postgres' }),
    }),
  });
  try {
    const rows = await admin.$queryRaw<
      unknown[]
    >`SELECT 1 FROM pg_database WHERE datname = ${E2E_DATABASE}`;
    if (rows.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${E2E_DATABASE}"`);
  } finally {
    await admin.$disconnect();
  }
}

function migrate(): void {
  execSync('npx prisma migrate deploy', {
    cwd: `${REPO_ROOT}apps/api`,
    env: { ...process.env, DB_NAME: E2E_DATABASE },
    stdio: 'pipe',
  });
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: buildDatabaseUrl({ ...connection, name: E2E_DATABASE }),
  }),
});

async function truncate(): Promise<void> {
  const [{ name }] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (name !== E2E_DATABASE) throw new Error(`Connected to "${name}", expected ${E2E_DATABASE}.`);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}

async function seed(): Promise<void> {
  const passwordHash = await hashPassword(PASSWORD);
  const users = {} as Record<UserKey, string>;
  for (const [key, user] of Object.entries(USERS) as [UserKey, (typeof USERS)[UserKey]][]) {
    users[key] = (await prisma.user.create({ data: { ...user, passwordHash } })).id;
  }
  const acme = await prisma.organization.create({ data: ORGS.acme });
  const beta = await prisma.organization.create({ data: ORGS.beta });
  await prisma.organizationMember.createMany({
    data: [
      { organizationId: acme.id, userId: users.owner, role: 'OWNER' },
      { organizationId: acme.id, userId: users.admin, role: 'ADMIN' },
      { organizationId: acme.id, userId: users.staff, role: 'STAFF' },
      { organizationId: acme.id, userId: users.styleA, role: 'STAFF' },
      { organizationId: acme.id, userId: users.styleB, role: 'STAFF' },
      { organizationId: beta.id, userId: users.owner, role: 'OWNER' },
      { organizationId: beta.id, userId: users.other, role: 'STAFF' },
      { organizationId: beta.id, userId: users.styleA, role: 'STAFF' },
    ],
  });

  // Ready-made sessions: the raw token goes only into the (git-ignored) storage state.
  rmSync(AUTH_DIR, { recursive: true, force: true });
  mkdirSync(AUTH_DIR, { recursive: true });
  const expiresAt = new Date(Date.now() + 2 * 86_400_000);
  for (const key of SESSION_USERS) {
    const token = randomBytes(32).toString('base64url');
    await prisma.session.create({
      data: {
        userId: users[key],
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt,
      },
    });
    const cookie = {
      name: 'app_session',
      value: token,
      domain: 'localhost',
      path: '/',
      expires: Math.floor(expiresAt.getTime() / 1000),
      httpOnly: true,
      secure: false,
      sameSite: 'Lax' as const,
    };
    writeFileSync(storageStateOf(key), JSON.stringify({ cookies: [cookie], origins: [] }));
  }
  writeFileSync(SEED_FILE, JSON.stringify({ users, acme: acme.id, beta: beta.id }, null, 2));
}

try {
  await createDatabaseIfMissing();
  migrate();
  await truncate();
  await seed();
  console.log(`E2E database "${E2E_DATABASE}" prepared.`);
} finally {
  await prisma.$disconnect();
}
