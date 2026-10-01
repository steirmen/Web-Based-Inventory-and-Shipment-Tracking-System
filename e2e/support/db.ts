import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import pg from 'pg';
import { E2E_DATABASE, REPO_ROOT } from './config.js';

/**
 * Direct read access (and fixture backdating) for assertions the UI can't
 * show, e.g. "no SALE movement was written". Connects ONLY to the E2E database.
 */
const fileEnv = existsSync(`${REPO_ROOT}.env`) ? parse(readFileSync(`${REPO_ROOT}.env`)) : {};
const env = { ...fileEnv, ...process.env };

let pool: pg.Pool | undefined;

function getPool(): pg.Pool {
  pool ??= new pg.Pool({
    host: env.DB_HOST,
    port: Number(env.DB_PORT ?? 5432),
    user: env.DB_USER,
    password: env.DB_PASSWORD ?? '',
    database: E2E_DATABASE,
    max: 2,
  });
  return pool;
}

export async function sql<Row extends Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<Row[]> {
  const client = await getPool().connect();
  try {
    const [{ name }] = (await client.query<{ name: string }>('SELECT current_database() AS name'))
      .rows;
    if (name !== E2E_DATABASE) throw new Error(`Refusing to query "${name}".`);
    return (await client.query<Row>(text, values)).rows;
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
