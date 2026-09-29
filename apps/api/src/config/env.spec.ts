import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.js';

const base = { DB_HOST: 'localhost', DB_NAME: 'app', DB_USER: 'postgres' };

describe('validateEnv', () => {
  it('applies secure-by-default auth settings for development', () => {
    const env = validateEnv(base);

    expect(env).toMatchObject({
      AUTH_SESSION_TTL_DAYS: 7,
      AUTH_COOKIE_NAME: 'app_session',
      AUTH_COOKIE_SECURE: false,
      API_CORS_ORIGINS: ['http://localhost:5173'],
    });
  });

  it('parses AUTH_COOKIE_SECURE from a string', () => {
    expect(validateEnv({ ...base, AUTH_COOKIE_SECURE: 'true' }).AUTH_COOKIE_SECURE).toBe(true);
  });

  it('requires a Secure cookie in production', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(/AUTH_COOKIE_SECURE/);
    expect(
      validateEnv({ ...base, NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'true' }).NODE_ENV,
    ).toBe('production');
  });

  it('rejects a wildcard CORS origin', () => {
    expect(() => validateEnv({ ...base, API_CORS_ORIGINS: 'http://localhost:5173,*' })).toThrow(
      /Wildcard origins are not allowed/,
    );
  });
});
