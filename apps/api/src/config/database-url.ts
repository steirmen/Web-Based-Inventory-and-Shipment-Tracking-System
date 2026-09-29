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
