import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorageService } from '@nestjs/throttler';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTH_RATE_LIMITS } from '../src/auth/auth.controller.js';

/**
 * HTTP-level security of the real request pipeline (configureApp), without a
 * database: CSRF origin checks, CORS, security headers, client-IP handling,
 * and rate limiting. Database-backed checks are in test/database/security.db-spec.ts.
 */

const ALLOWED = 'http://localhost:5173';
const EVIL = 'http://localhost:6666'; // same SITE as the app (localhost), different origin
const ORG = '/organizations/0198c0de-0000-7000-8000-000000000001';

/** Prisma stand-in: no users exist, so login fails without touching a database. */
const prismaStub = () => ({
  $queryRaw: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  user: { findUnique: vi.fn<() => Promise<null>>().mockResolvedValue(null) },
  session: { findUnique: vi.fn<() => Promise<null>>().mockResolvedValue(null) },
});

let app: INestApplication | undefined;

/**
 * The app with environment overrides. AppModule validates the environment
 * when it is first imported, so each call imports a fresh copy.
 */
async function createApp(env: Record<string, string> = {}) {
  vi.resetModules();
  const previous = { ...process.env };
  Object.assign(process.env, env);
  try {
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');
    const { PrismaService } = await import('../src/database/prisma.service.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub())
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    return app;
  } finally {
    process.env = previous;
  }
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('CSRF: state-changing requests must come from an allowed origin', () => {
  it('rejects a foreign Origin on every unsafe method, before authentication or validation', async () => {
    const server = (await createApp()).getHttpServer();
    // Each request is created right before it is awaited (supertest starts a server per request).
    const attempts = [
      () => request(server).post('/auth/login').set('Origin', EVIL).send({}),
      () => request(server).post('/auth/logout').set('Origin', EVIL),
      () => request(server).post('/invitations/abc/accept').set('Origin', EVIL),
      () => request(server).post(`${ORG}/orders/x/process`).set('Origin', EVIL),
      () => request(server).post(`${ORG}/inventory/adjust`).set('Origin', EVIL).send({}),
      () => request(server).patch(ORG).set('Origin', EVIL).send({ name: 'x' }),
      () => request(server).delete(`${ORG}/members/x`).set('Origin', EVIL),
      () => request(server).put('/me/appearance').set('Origin', EVIL).send({}),
    ];
    for (const attempt of attempts) {
      const response = await attempt();
      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        statusCode: 403,
        code: 'CSRF_ORIGIN_REJECTED',
        message: 'This request did not come from an allowed origin.',
      });
    }
  });

  it('rejects the opaque "null" origin and a foreign or malformed Referer', async () => {
    const server = (await createApp()).getHttpServer();
    await request(server).post('/auth/logout').set('Origin', 'null').expect(403);
    await request(server).post('/auth/logout').set('Referer', `${EVIL}/attack.html`).expect(403);
    await request(server).post('/auth/logout').set('Referer', 'not a url').expect(403);
  });

  it('accepts the web app origin (Origin or Referer) and non-browser clients', async () => {
    const server = (await createApp()).getHttpServer();
    await request(server).post('/auth/logout').set('Origin', ALLOWED).expect(204);
    await request(server).post('/auth/logout').set('Referer', `${ALLOWED}/org/x`).expect(204);
    // No Origin and no Referer: not a browser, so it can't carry a victim's cookie.
    await request(server).post('/auth/logout').expect(204);
  });

  it('never blocks safe methods (reads stay readable; authentication still applies)', async () => {
    const server = (await createApp()).getHttpServer();
    await request(server).get('/health').set('Origin', EVIL).expect(200);
    const read = await request(server).get(`${ORG}/orders`).set('Origin', EVIL).expect(401);
    expect(read.body.code).toBe('AUTH_UNAUTHENTICATED');
  });
});

describe('CORS', () => {
  it('answers a preflight from the allowed origin with credentials', async () => {
    const server = (await createApp()).getHttpServer();
    const response = await request(server)
      .options(`${ORG}/orders`)
      .set('Origin', ALLOWED)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('gives a disallowed origin no CORS access at all (preflight or request)', async () => {
    const server = (await createApp()).getHttpServer();
    const preflight = await request(server)
      .options(`${ORG}/orders`)
      .set('Origin', EVIL)
      .set('Access-Control-Request-Method', 'POST');
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    expect(preflight.headers['access-control-allow-credentials']).toBeUndefined();
    const read = await request(server).get('/health').set('Origin', EVIL);
    expect(read.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('matches origins exactly (no prefix, suffix, or scheme tricks)', async () => {
    const server = (await createApp()).getHttpServer();
    for (const origin of [
      'http://localhost:51730',
      'https://localhost:5173',
      'http://localhost:5173.evil.test',
      'http://evil.test/http://localhost:5173',
    ]) {
      const response = await request(server).get('/health').set('Origin', origin);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    }
  });
});

describe('security headers', () => {
  it('are sent on success and error responses', async () => {
    const server = (await createApp()).getHttpServer();
    for (const response of [
      await request(server).get('/health'),
      await request(server).get('/auth/me'),
      await request(server).get('/no-such-route'),
    ]) {
      expect(response.headers).toMatchObject({
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'content-security-policy': expect.stringContaining("frame-ancestors 'none'"),
        'referrer-policy': 'no-referrer',
      });
      expect(response.headers['x-powered-by']).toBeUndefined();
      // HSTS only in production (HTTPS).
      expect(response.headers['strict-transport-security']).toBeUndefined();
    }
  });

  it('adds HSTS in production', async () => {
    const server = (
      await createApp({
        NODE_ENV: 'production',
        AUTH_COOKIE_SECURE: 'true',
        API_CORS_ORIGINS: 'https://app.example.com',
      })
    ).getHttpServer();
    const response = await request(server).get('/health');
    expect(response.headers['strict-transport-security']).toBe('max-age=31536000');
  });
});

describe('client IP and rate limiting', () => {
  const login = (server: unknown, forwardedFor?: string) => {
    const pending = request(server as Parameters<typeof request>[0])
      .post('/auth/login')
      .send({ email: 'nobody@test.example', password: 'wrong-password' });
    return forwardedFor ? pending.set('X-Forwarded-For', forwardedFor) : pending;
  };

  it('ignores X-Forwarded-For by default, so changing it cannot dodge the login limit', async () => {
    const server = (await createApp()).getHttpServer();
    for (let attempt = 0; attempt < AUTH_RATE_LIMITS.login.limit; attempt += 1) {
      await login(server, `203.0.113.${attempt}`).expect(401);
    }
    const blocked = await login(server, '198.51.100.7').expect(429);
    expect(blocked.body).toEqual({
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please wait a moment and try again.',
    });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('with a trusted proxy configured, limits each forwarded client separately', async () => {
    const server = (await createApp({ API_TRUST_PROXY: 'loopback' })).getHttpServer();
    for (let attempt = 0; attempt < AUTH_RATE_LIMITS.login.limit; attempt += 1) {
      await login(server, '203.0.113.10').expect(401);
    }
    const blocked = await login(server, '203.0.113.10');
    // Another client behind the same proxy is not affected.
    const other = await login(server, '203.0.113.11');
    expect([blocked.status, other.status]).toEqual([429, 401]);
  });
});

describe('rate-limit storage', () => {
  it('evicts idle keys after their window, so memory stays bounded', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const storage = new ThrottlerStorageService();
      for (let client = 0; client < 100; client += 1) {
        await storage.increment(`login:${client}`, 60_000, 10, 0, 'default');
      }
      expect(storage.storage.size).toBe(100);
      vi.setSystemTime(Date.now() + 61_000);
      (storage as unknown as { evictIdleRecords(now?: number): void }).evictIdleRecords();
      expect(storage.storage.size).toBe(0);
      storage.onApplicationShutdown();
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the configured windows', () => {
    expect(AUTH_RATE_LIMITS).toEqual({
      login: { limit: 10, ttl: 60_000 },
      register: { limit: 5, ttl: 15 * 60_000 },
    });
  });
});
