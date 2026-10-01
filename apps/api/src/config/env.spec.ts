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
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        AUTH_COOKIE_SECURE: 'true',
        API_CORS_ORIGINS: 'https://app.example.com',
        DB_PASSWORD: 'secret',
      }).NODE_ENV,
    ).toBe('production');
  });

  it('requires https origins in production (fail closed)', () => {
    const production = { ...base, NODE_ENV: 'production', AUTH_COOKIE_SECURE: 'true' };
    expect(() => validateEnv(production)).toThrow(/must be an https/);
    expect(() =>
      validateEnv({ ...production, API_CORS_ORIGINS: 'https://app.example.com,http://x.test' }),
    ).toThrow(/must be an https/);
  });

  it('requires a database password in production, and never prints secret values', () => {
    const production = {
      ...base,
      NODE_ENV: 'production',
      AUTH_COOKIE_SECURE: 'true',
      API_CORS_ORIGINS: 'https://app.example.com',
    };
    expect(() => validateEnv(production)).toThrow(/DB_PASSWORD is required/);
    let message = '';
    try {
      validateEnv({ ...production, DB_PASSWORD: 'Sup3r-Secret-Value', AUTH_SESSION_TTL_DAYS: 'x' });
    } catch (error) {
      message = String(error);
    }
    expect(message).toMatch(/AUTH_SESSION_TTL_DAYS/);
    expect(message).not.toContain('Sup3r-Secret-Value');
  });

  it('accepts only exact origins (no path, no trailing slash)', () => {
    for (const bad of [
      'http://localhost:5173/',
      'localhost:5173',
      'https://a.test/app',
      'ftp://a.test',
    ]) {
      expect(() => validateEnv({ ...base, API_CORS_ORIGINS: bad })).toThrow(/exact origins/);
    }
    expect(
      validateEnv({ ...base, API_CORS_ORIGINS: 'http://localhost:5173, https://app.example.com' })
        .API_CORS_ORIGINS,
    ).toEqual(['http://localhost:5173', 'https://app.example.com']);
  });

  it('trusts no proxy by default and never "every" proxy', () => {
    expect(validateEnv(base).API_TRUST_PROXY).toBe(false);
    expect(validateEnv({ ...base, API_TRUST_PROXY: '1' }).API_TRUST_PROXY).toBe(1);
    expect(
      validateEnv({ ...base, API_TRUST_PROXY: 'loopback, 10.0.0.0/8' }).API_TRUST_PROXY,
    ).toEqual(['loopback', '10.0.0.0/8']);
    for (const bad of ['true', '0', '99', 'everyone', '10.0.0.0/8; rm']) {
      expect(() => validateEnv({ ...base, API_TRUST_PROXY: bad })).toThrow(/API_TRUST_PROXY/);
    }
  });

  it('fails clearly when the database configuration is missing or invalid', () => {
    expect(() => validateEnv({})).toThrow(/Invalid environment configuration[\s\S]*DB_HOST/);
    expect(() => validateEnv({ ...base, DB_PORT: 'not-a-port' })).toThrow(/DB_PORT/);
    expect(() => validateEnv({ ...base, API_PORT: '70000' })).toThrow(/API_PORT/);
    expect(() => validateEnv({ ...base, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('rejects a wildcard CORS origin', () => {
    expect(() => validateEnv({ ...base, API_CORS_ORIGINS: 'http://localhost:5173,*' })).toThrow(
      /Wildcard origins are not allowed/,
    );
  });
});
