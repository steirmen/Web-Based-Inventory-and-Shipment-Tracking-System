export interface DatabaseConnectionOptions {
  host: string;
  port: number | string;
  name: string;
  user: string;
  password: string;
}

/** Builds a PostgreSQL connection string, URL-encoding credentials and the database name. */
export function buildDatabaseUrl({
  host,
  port,
  name,
  user,
  password,
}: DatabaseConnectionOptions): string {
  const credentials = password
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
    : encodeURIComponent(user);

  return `postgresql://${credentials}@${host}:${port}/${encodeURIComponent(name)}`;
}

/**
 * Reads the `DB_*` variables for tooling that runs outside Nest's ConfigModule
 * (Prisma CLI config, seed script, database tests). Returns `undefined` when the
 * required values are missing.
 */
export function databaseOptionsFromEnv(
  env: Record<string, string | undefined>,
): DatabaseConnectionOptions | undefined {
  const { DB_HOST, DB_PORT = '5432', DB_NAME, DB_USER, DB_PASSWORD = '' } = env;

  if (!DB_HOST || !DB_NAME || !DB_USER) {
    return undefined;
  }

  return { host: DB_HOST, port: DB_PORT, name: DB_NAME, user: DB_USER, password: DB_PASSWORD };
}
