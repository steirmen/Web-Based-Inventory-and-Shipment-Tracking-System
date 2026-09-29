import { describe, expect, it } from 'vitest';
import { buildDatabaseUrl, databaseOptionsFromEnv } from './database-url.js';

describe('buildDatabaseUrl', () => {
  const base = { host: 'localhost', port: 5432, name: 'app', user: 'postgres' };

  it('builds a PostgreSQL connection string', () => {
    expect(buildDatabaseUrl({ ...base, password: 'secret' })).toBe(
      'postgresql://postgres:secret@localhost:5432/app',
    );
  });

  it('URL-encodes special characters in credentials', () => {
    expect(buildDatabaseUrl({ ...base, password: 'p@ss:w/rd#1' })).toBe(
      'postgresql://postgres:p%40ss%3Aw%2Frd%231@localhost:5432/app',
    );
  });

  it('omits the password separator when no password is set', () => {
    expect(buildDatabaseUrl({ ...base, password: '' })).toBe(
      'postgresql://postgres@localhost:5432/app',
    );
  });
});

describe('databaseOptionsFromEnv', () => {
  it('reads DB_* variables with defaults for port and password', () => {
    expect(
      databaseOptionsFromEnv({ DB_HOST: 'localhost', DB_NAME: 'app', DB_USER: 'postgres' }),
    ).toEqual({ host: 'localhost', port: '5432', name: 'app', user: 'postgres', password: '' });
  });

  it('returns undefined when required variables are missing', () => {
    expect(databaseOptionsFromEnv({ DB_HOST: 'localhost' })).toBeUndefined();
  });
});
