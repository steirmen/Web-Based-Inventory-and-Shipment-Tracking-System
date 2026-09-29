import { createHash } from 'node:crypto';
import type { ApiErrorBody } from '@app/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_RATE_LIMITS } from '../../src/auth/auth.controller.js';
import { hashPassword } from '../../src/auth/password/password-hashing.js';
import { prisma } from './support/database.js';
import { type CapturingLogger, createHttpApp, getSetCookie } from './support/http-app.js';

/**
 * HTTP-level authentication tests: the real Nest application and request
 * pipeline (cookies, CORS, validation, guards, error filter) against the test database.
 */

const COOKIE = 'app_session';
const PASSWORD = 'Correct-Horse-Battery-9';
const FRONTEND_ORIGIN = 'http://localhost:5173';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

let app: INestApplication;
let logger: CapturingLogger;
const api = () => request(app.getHttpServer());

beforeEach(async () => {
  ({ app, logger } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

function register(body: Record<string, unknown> = {}) {
  return api()
    .post('/auth/register')
    .send({ name: 'Ada Example', email: 'ada@test.example', password: PASSWORD, ...body });
}

/** Registers a user and returns the raw session token from the cookie. */
async function registerAndGetToken(email = 'ada@test.example'): Promise<string> {
  const response = await register({ email }).expect(201);
  return getSetCookie(response, COOKIE)!.value;
}

const withSession = (token: string) => `${COOKIE}=${token}`;

describe('POST /auth/register', () => {
  it('creates the user, starts a session, and returns only safe fields', async () => {
    const response = await register({
      name: '  Ada Example  ',
      email: '  Ada.Example@Test.EXAMPLE ',
    }).expect(201);

    expect(response.body).toEqual({
      user: { id: expect.any(String), name: 'Ada Example', email: 'ada.example@test.example' },
    });
    expect(response.headers['cache-control']).toBe('no-store');

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'ada.example@test.example' },
      include: { sessions: true },
    });
    expect(user.name).toBe('Ada Example');
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
    expect(user.sessions).toHaveLength(1);
  });

  it('sets a secure-by-design HttpOnly session cookie', async () => {
    const response = await register().expect(201);
    const cookie = getSetCookie(response, COOKIE);

    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie?.attributes).toMatchObject({ httponly: true, samesite: 'Lax', path: '/' });
    expect(cookie?.attributes.secure).toBeUndefined(); // AUTH_COOKIE_SECURE=false for local HTTP
    // Max-Age matches the 7-day session lifetime (allowing for elapsed milliseconds).
    const maxAge = Number(cookie?.attributes['max-age']);
    expect(maxAge).toBeGreaterThan(7 * 86_400 - 5);
    expect(maxAge).toBeLessThanOrEqual(7 * 86_400);
    expect(cookie?.attributes.expires).toBeDefined();
  });

  it('stores only the SHA-256 hash of the session token', async () => {
    const token = await registerAndGetToken();

    const sessions = await prisma.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokenHash).toBe(sha256(token));
    expect(sessions[0].tokenHash).not.toContain(token);
    expect(await prisma.session.count({ where: { tokenHash: token } })).toBe(0);
  });

  it('rejects a duplicate email (case-insensitively) without creating a session', async () => {
    await register({ email: 'taken@test.example' }).expect(201);

    const response = await register({ email: 'TAKEN@test.example' }).expect(409);

    expect(response.body).toMatchObject({ statusCode: 409, code: 'AUTH_EMAIL_TAKEN' });
    expect(getSetCookie(response, COOKIE)).toBeUndefined();
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.session.count()).toBe(1);
  });

  it.each([
    ['an invalid email', { email: 'not-an-email' }, 'email'],
    ['an empty name', { name: '   ' }, 'name'],
    ['a short password', { password: 'short' }, 'password'],
    ['an overly long name', { name: 'n'.repeat(201) }, 'name'],
    ['an overly long email', { email: `${'e'.repeat(320)}@test.example` }, 'email'],
    ['an overly long password', { password: 'p'.repeat(129) }, 'password'],
    ['a missing password', { password: undefined }, 'password'],
    ['a non-string name', { name: 42 }, 'name'],
  ])('rejects %s with VALIDATION_ERROR', async (_case, body, field) => {
    const response = await register(body).expect(400);
    const error = response.body as ApiErrorBody;

    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details?.map((detail) => detail.field)).toContain(field);
    expect(await prisma.user.count()).toBe(0);
  });

  it('rejects unknown fields', async () => {
    const response = await register({ role: 'OWNER' }).expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('does not trim or alter the password', async () => {
    await register({ password: `  ${PASSWORD}  ` }).expect(201);

    await api()
      .post('/auth/login')
      .send({ email: 'ada@test.example', password: PASSWORD })
      .expect(401);
    await api()
      .post('/auth/login')
      .send({ email: 'ada@test.example', password: `  ${PASSWORD}  ` })
      .expect(200);
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await register({ email: 'login@test.example' }).expect(201);
  });

  it('signs in with valid credentials (email normalized) and issues a new session', async () => {
    const response = await api()
      .post('/auth/login')
      .send({ email: ' LOGIN@test.example ', password: PASSWORD })
      .expect(200);

    expect(response.body).toEqual({
      user: { id: expect.any(String), name: 'Ada Example', email: 'login@test.example' },
    });
    const token = getSetCookie(response, COOKIE)?.value;
    expect(token).toBeDefined();
    expect(await prisma.session.count()).toBe(2);
    expect(await prisma.session.count({ where: { tokenHash: sha256(token!) } })).toBe(1);
  });

  it('returns the same generic failure for a wrong password and an unknown email', async () => {
    const wrongPassword = await api()
      .post('/auth/login')
      .send({ email: 'login@test.example', password: 'Wrong-Password-123' })
      .expect(401);
    const unknownEmail = await api()
      .post('/auth/login')
      .send({ email: 'nobody@test.example', password: PASSWORD })
      .expect(401);

    const expected = {
      statusCode: 401,
      code: 'AUTH_INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    };
    expect(wrongPassword.body).toEqual(expected);
    expect(unknownEmail.body).toEqual(expected);
    expect(getSetCookie(wrongPassword, COOKIE)).toBeUndefined();
    expect(getSetCookie(unknownEmail, COOKIE)).toBeUndefined();
  });

  it('rejects users without a password with the same generic failure', async () => {
    await prisma.user.create({ data: { name: 'Invited', email: 'invited@test.example' } });

    const response = await api()
      .post('/auth/login')
      .send({ email: 'invited@test.example', password: PASSWORD })
      .expect(401);

    expect(response.body.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('validates the input shape', async () => {
    const response = await api()
      .post('/auth/login')
      .send({ email: 'login@test.example' })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /auth/me', () => {
  it('returns the current user for a valid session and updates last-seen time', async () => {
    const token = await registerAndGetToken();
    await prisma.session.updateMany({
      data: {
        createdAt: new Date(Date.now() - 3_600_000),
        lastSeenAt: new Date(Date.now() - 3_600_000),
      },
    });

    const response = await api().get('/auth/me').set('Cookie', withSession(token)).expect(200);

    expect(response.body).toEqual({
      user: { id: expect.any(String), name: 'Ada Example', email: 'ada@test.example' },
    });
    const session = await prisma.session.findFirstOrThrow();
    expect(Date.now() - session.lastSeenAt.getTime()).toBeLessThan(60_000);
  });

  it('returns 401 AUTH_UNAUTHENTICATED without a session cookie', async () => {
    const response = await api().get('/auth/me').expect(401);

    expect(response.body).toEqual({
      statusCode: 401,
      code: 'AUTH_UNAUTHENTICATED',
      message: 'Authentication required.',
    });
  });

  it('returns 401 and clears the cookie for an unknown token', async () => {
    const response = await api()
      .get('/auth/me')
      .set('Cookie', withSession('forged-token-value'))
      .expect(401);

    expect(response.body.code).toBe('AUTH_UNAUTHENTICATED');
    expect(getSetCookie(response, COOKIE)?.value).toBe('');
  });

  it('returns 401 AUTH_SESSION_EXPIRED once the session has expired', async () => {
    const token = await registerAndGetToken();
    await prisma.session.updateMany({
      data: {
        createdAt: new Date(Date.now() - 2 * 86_400_000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const response = await api().get('/auth/me').set('Cookie', withSession(token)).expect(401);

    expect(response.body.code).toBe('AUTH_SESSION_EXPIRED');
    expect(getSetCookie(response, COOKIE)?.value).toBe('');
  });

  it('returns 401 AUTH_SESSION_REVOKED for a revoked session', async () => {
    const token = await registerAndGetToken();
    await prisma.session.updateMany({ data: { revokedAt: new Date() } });

    const response = await api().get('/auth/me').set('Cookie', withSession(token)).expect(401);

    expect(response.body.code).toBe('AUTH_SESSION_REVOKED');
  });
});

describe('POST /auth/logout', () => {
  it('revokes the session in the database and clears the cookie', async () => {
    const token = await registerAndGetToken();

    const response = await api().post('/auth/logout').set('Cookie', withSession(token)).expect(204);

    const cleared = getSetCookie(response, COOKIE);
    expect(cleared?.value).toBe('');
    expect(new Date(String(cleared?.attributes.expires)).getTime()).toBeLessThan(Date.now());
    const session = await prisma.session.findFirstOrThrow();
    expect(session.revokedAt).toBeInstanceOf(Date);

    // Re-sending the old cookie does not work: revocation is server-side.
    await api().get('/auth/me').set('Cookie', withSession(token)).expect(401);
  });

  it('is safe to call repeatedly and without a session', async () => {
    const token = await registerAndGetToken();

    await api().post('/auth/logout').set('Cookie', withSession(token)).expect(204);
    const firstRevokedAt = (await prisma.session.findFirstOrThrow()).revokedAt;
    await api().post('/auth/logout').set('Cookie', withSession(token)).expect(204);
    await api().post('/auth/logout').expect(204);

    expect((await prisma.session.findFirstOrThrow()).revokedAt).toEqual(firstRevokedAt);
  });

  it('only revokes the presented session', async () => {
    const token = await registerAndGetToken();
    const login = await api()
      .post('/auth/login')
      .send({ email: 'ada@test.example', password: PASSWORD })
      .expect(200);
    const otherToken = getSetCookie(login, COOKIE)!.value;

    await api().post('/auth/logout').set('Cookie', withSession(token)).expect(204);

    await api().get('/auth/me').set('Cookie', withSession(otherToken)).expect(200);
  });
});

describe('full browser-like lifecycle', () => {
  it('register → me → logout → me (401) → login → me', async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post('/auth/register')
      .send({ name: 'Life Cycle', email: 'cycle@test.example', password: PASSWORD })
      .expect(201);
    await agent.get('/auth/me').expect(200);
    await agent.post('/auth/logout').expect(204);
    await agent.get('/auth/me').expect(401);
    await agent
      .post('/auth/login')
      .send({ email: 'cycle@test.example', password: PASSWORD })
      .expect(200);
    const me = await agent.get('/auth/me').expect(200);

    expect(me.body.user.email).toBe('cycle@test.example');
  });
});

describe('security', () => {
  it('never returns password hashes and never logs passwords or tokens', async () => {
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method),
    );

    const registered = await register().expect(201);
    const token = getSetCookie(registered, COOKIE)!.value;
    const responses = [
      registered,
      await api().post('/auth/login').send({ email: 'ada@test.example', password: PASSWORD }),
      await api()
        .post('/auth/login')
        .send({ email: 'ada@test.example', password: 'Wrong-Password-1' }),
      await api().post('/auth/register').send({ name: 'x', email: 'bad', password: PASSWORD }),
      await api().get('/auth/me').set('Cookie', withSession(token)),
      await api().post('/auth/logout').set('Cookie', withSession(token)),
    ];

    const { passwordHash } = await prisma.user.findFirstOrThrow();
    for (const response of responses) {
      const text = JSON.stringify(response.body ?? '');
      expect(text).not.toContain('passwordHash');
      expect(text).not.toContain('$argon2');
      expect(text).not.toContain(PASSWORD);
    }

    const logged = [
      ...logger.lines,
      ...consoleSpies.flatMap((spy) => spy.mock.calls.map((call) => call.map(String).join(' '))),
    ].join('\n');
    expect(logged).not.toContain(PASSWORD);
    expect(logged).not.toContain(passwordHash!);
    expect(logged).not.toContain(token);
    expect(logged).toContain('User registered');
  });

  it('never exposes internal errors or stack traces', async () => {
    const response = await api()
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": broken json')
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: 'The request could not be processed.',
    });
  });

  it('rate-limits login attempts per client', async () => {
    const attempt = () =>
      api().post('/auth/login').send({ email: 'nobody@test.example', password: PASSWORD });

    for (let i = 0; i < AUTH_RATE_LIMITS.login.limit; i++) {
      await attempt().expect(401);
    }
    const limited = await attempt().expect(429);

    expect(limited.body.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('rate-limits registrations per client', async () => {
    for (let i = 0; i < AUTH_RATE_LIMITS.register.limit; i++) {
      await register({ email: `user${i}@test.example` }).expect(201);
    }

    const limited = await register({ email: 'one-too-many@test.example' }).expect(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
  });

  it('allows credentials only for the configured origin', async () => {
    const allowed = await api().options('/auth/me').set('Origin', FRONTEND_ORIGIN);
    expect(allowed.headers['access-control-allow-origin']).toBe(FRONTEND_ORIGIN);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const other = await api().options('/auth/me').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('keeps /health public while other routes require a session', async () => {
    await api().get('/health').expect(200);
    await api().get('/auth/me').expect(401);
  });

  it('seeded password hashes use Argon2id', async () => {
    expect(await hashPassword(PASSWORD)).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
  });
});
