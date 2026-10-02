import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from './support/database.js';
import { expectCheckViolation } from './support/db-errors.js';
import { createHttpApp } from './support/http-app.js';
import { createSignedInUser } from './support/organizations.js';

let app: INestApplication;
const api = () => request(app.getHttpServer());

beforeEach(async () => {
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

const BASE = '/me/preferences';

describe('PATCH /me/preferences (interface language)', () => {
  it('stores the signed-in user’s language and returns it with /auth/me', async () => {
    const user = await createSignedInUser();

    const before = await api().get('/auth/me').set('Cookie', user.cookie).expect(200);
    const saved = await api()
      .patch(BASE)
      .set('Cookie', user.cookie)
      .send({ language: 'tr' })
      .expect(200);
    const after = await api().get('/auth/me').set('Cookie', user.cookie).expect(200);

    expect(before.body.user.language).toBeNull();
    expect(saved.body).toEqual({ language: 'tr' });
    expect(after.body.user).toEqual({ ...before.body.user, language: 'tr' });
  });

  it('changes only the caller’s own language', async () => {
    const ada = await createSignedInUser({ email: 'ada@test.example' });
    const ben = await createSignedInUser({ email: 'ben@test.example' });

    await api().patch(BASE).set('Cookie', ada.cookie).send({ language: 'tr' }).expect(200);
    const rejected = await api()
      .patch(BASE)
      .set('Cookie', ada.cookie)
      .send({ language: 'en', userId: ben.user.id })
      .expect(400);

    expect(rejected.body.code).toBe('VALIDATION_ERROR');
    const languages = await prisma.user.findMany({
      where: { id: { in: [ada.user.id, ben.user.id] } },
      select: { email: true, language: true },
      orderBy: { email: 'asc' },
    });
    expect(languages).toEqual([
      { email: 'ada@test.example', language: 'tr' },
      { email: 'ben@test.example', language: null },
    ]);
  });

  it.each(['de', 'TR', 'tr-TR', '', null, 1])('rejects the language %j', async (language) => {
    const user = await createSignedInUser();
    const response = await api()
      .patch(BASE)
      .set('Cookie', user.cookie)
      .send({ language })
      .expect(400);
    expect(response.body.details[0].field).toBe('language');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.user.id } })).language).toBe(
      null,
    );
  });

  it('requires a session and an allowed origin', async () => {
    const user = await createSignedInUser();

    await api().patch(BASE).send({ language: 'tr' }).expect(401);
    const foreign = await api()
      .patch(BASE)
      .set('Cookie', user.cookie)
      .set('Origin', 'https://evil.example')
      .send({ language: 'tr' })
      .expect(403);

    expect(foreign.body.code).toBe('CSRF_ORIGIN_REJECTED');
  });

  it('the database accepts only known languages', async () => {
    const user = await createSignedInUser();
    await expectCheckViolation(
      prisma.user.update({ where: { id: user.user.id }, data: { language: 'xx' } }),
      'users_language_check',
    );
  });
});
