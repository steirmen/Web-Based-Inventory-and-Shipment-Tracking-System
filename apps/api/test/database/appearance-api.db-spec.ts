import { APPEARANCE_LIMITS, type AppearanceConfig, DEFAULT_APPEARANCE } from '@app/shared';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from './support/database.js';
import { createHttpApp } from './support/http-app.js';
import { createSignedInUser, createTeam, NON_EXISTENT_ID } from './support/organizations.js';

let app: INestApplication;
const api = () => request(app.getHttpServer());

beforeEach(async () => {
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

const BASE = '/me/appearance';

const NIGHT: AppearanceConfig = {
  mode: 'dark',
  theme: 'ocean',
  customAccent: '#0EA5E9',
  customTone: 'cool',
  backgroundEffect: 'starry-night',
  animationIntensity: 'low',
  density: 'compact',
  radius: 'round',
  fontScale: 'large',
};

describe('GET/PUT /me/appearance', () => {
  it('starts from the defaults without writing anything', async () => {
    const user = await createSignedInUser();

    const response = await api().get(BASE).set('Cookie', user.cookie).expect(200);

    expect(response.body).toEqual({ appearance: DEFAULT_APPEARANCE, updatedAt: null });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(await prisma.userAppearance.count()).toBe(0);
  });

  it('saves a complete configuration (accent stored lower-case) and returns it', async () => {
    const user = await createSignedInUser();

    const saved = await api().put(BASE).set('Cookie', user.cookie).send(NIGHT).expect(200);
    const read = await api().get(BASE).set('Cookie', user.cookie).expect(200);

    expect(saved.body.appearance).toEqual({ ...NIGHT, customAccent: '#0ea5e9' });
    expect(read.body).toEqual({ appearance: saved.body.appearance, updatedAt: expect.any(String) });
    expect(
      await prisma.userAppearance.findUnique({ where: { userId: user.user.id } }),
    ).toMatchObject({ theme: 'ocean', backgroundEffect: 'starry-night', customAccent: '#0ea5e9' });
  });

  it.each([
    ['an unknown theme', { theme: 'neon' }, 'theme'],
    ['an unknown effect', { backgroundEffect: 'fireworks' }, 'backgroundEffect'],
    ['an unknown mode', { mode: 'system' }, 'mode'],
    ['an unknown density', { density: 'tiny' }, 'density'],
    ['an unknown radius', { radius: '12px' }, 'radius'],
    ['an unknown intensity', { animationIntensity: 'max' }, 'animationIntensity'],
    ['an unknown text size', { fontScale: 'huge' }, 'fontScale'],
    ['a named color', { customAccent: 'red' }, 'customAccent'],
    ['a short hex color', { customAccent: '#fff' }, 'customAccent'],
    ['a CSS expression', { customAccent: 'rgb(0,0,0)' }, 'customAccent'],
    ['a missing field', { radius: undefined }, 'radius'],
    ['an owner id in the body', { userId: NON_EXISTENT_ID }, 'userId'],
    ['an organization id in the body', { organizationId: NON_EXISTENT_ID }, 'organizationId'],
    ['raw CSS variables', { cssVariables: { '--primary': 'red' } }, 'cssVariables'],
  ])('rejects %s', async (_case, change, field) => {
    const user = await createSignedInUser();

    const response = await api()
      .put(BASE)
      .set('Cookie', user.cookie)
      .send({ ...NIGHT, ...change })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.details.map((d: { field: string }) => d.field)).toContain(field);
    expect(await prisma.userAppearance.count()).toBe(0);
  });

  it('resets to the defaults', async () => {
    const user = await createSignedInUser();
    await api().put(BASE).set('Cookie', user.cookie).send(NIGHT).expect(200);

    const reset = await api().post(`${BASE}/reset`).set('Cookie', user.cookie).expect(200);

    expect(reset.body).toEqual({ appearance: DEFAULT_APPEARANCE, updatedAt: null });
    expect(await prisma.userAppearance.count()).toBe(0);
  });

  it('requires a session for every route', async () => {
    const attempts = [
      () => api().get(BASE),
      () => api().put(BASE).send(NIGHT),
      () => api().post(`${BASE}/reset`),
      () => api().get(`${BASE}/profiles`),
      () => api().post(`${BASE}/profiles`).send({ name: 'X', appearance: NIGHT }),
      () => api().patch(`${BASE}/profiles/${NON_EXISTENT_ID}`).send({ name: 'X' }),
      () => api().delete(`${BASE}/profiles/${NON_EXISTENT_ID}`),
      () => api().post(`${BASE}/profiles/${NON_EXISTENT_ID}/apply`),
    ];
    for (const attempt of attempts) {
      const response = await attempt().expect(401);
      expect(response.body.code).toBe('AUTH_UNAUTHENTICATED');
    }
  });

  it('is the same in every organization of the user (not organization-scoped)', async () => {
    const a = await createTeam('org-a');
    const b = await createTeam('org-b');
    // The OWNER of A joins B as STAFF: one person, two workspaces.
    await prisma.organizationMember.create({
      data: { organizationId: b.organization.id, userId: a.owner.user.id, role: 'STAFF' },
    });

    await api().put(BASE).set('Cookie', a.owner.cookie).send(NIGHT).expect(200);

    expect(await prisma.userAppearance.count()).toBe(1);
    const read = await api().get(BASE).set('Cookie', a.owner.cookie).expect(200);
    expect(read.body.appearance.theme).toBe('ocean');
  });
});

describe('appearance profiles', () => {
  const profiles = (cookie: string) =>
    api().get(`${BASE}/profiles`).set('Cookie', cookie).expect(200);

  it('creates, lists, renames, applies, and deletes profiles', async () => {
    const user = await createSignedInUser();
    const create = (name: string, appearance: AppearanceConfig) =>
      api().post(`${BASE}/profiles`).set('Cookie', user.cookie).send({ name, appearance });

    const night = await create('  Gece   Çalışma ', NIGHT).expect(201);
    await create('Ofis', DEFAULT_APPEARANCE).expect(201);
    const listed = await profiles(user.cookie);
    const renamed = await api()
      .patch(`${BASE}/profiles/${night.body.profile.id}`)
      .set('Cookie', user.cookie)
      .send({ name: 'Gece' })
      .expect(200);
    const applied = await api()
      .post(`${BASE}/profiles/${night.body.profile.id}/apply`)
      .set('Cookie', user.cookie)
      .expect(200);
    await api()
      .delete(`${BASE}/profiles/${night.body.profile.id}`)
      .set('Cookie', user.cookie)
      .expect(204);
    const afterDelete = await api()
      .post(`${BASE}/profiles/${night.body.profile.id}/apply`)
      .set('Cookie', user.cookie)
      .expect(404);

    expect(night.body.profile).toEqual({
      id: expect.any(String),
      name: 'Gece Çalışma',
      appearance: { ...NIGHT, customAccent: '#0ea5e9' },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(listed.body.profiles.map((p: { name: string }) => p.name)).toEqual([
      'Gece Çalışma',
      'Ofis',
    ]);
    expect(renamed.body.profile).toMatchObject({ name: 'Gece', appearance: { theme: 'ocean' } });
    expect(applied.body.appearance).toEqual({ ...NIGHT, customAccent: '#0ea5e9' });
    expect(afterDelete.body.code).toBe('APPEARANCE_PROFILE_NOT_FOUND');
    expect(
      (await profiles(user.cookie)).body.profiles.map((p: { name: string }) => p.name),
    ).toEqual(['Ofis']);
    // Applying copied the configuration: deleting the profile keeps the current appearance.
    expect((await api().get(BASE).set('Cookie', user.cookie)).body.appearance.theme).toBe('ocean');
  });

  it('replaces a profile’s stored configuration', async () => {
    const user = await createSignedInUser();
    const created = await api()
      .post(`${BASE}/profiles`)
      .set('Cookie', user.cookie)
      .send({ name: 'Sunum', appearance: DEFAULT_APPEARANCE })
      .expect(201);

    const updated = await api()
      .patch(`${BASE}/profiles/${created.body.profile.id}`)
      .set('Cookie', user.cookie)
      .send({ appearance: NIGHT })
      .expect(200);

    expect(updated.body.profile).toMatchObject({ name: 'Sunum', appearance: { mode: 'dark' } });
  });

  it('keeps names unique per user (case-insensitive) but allows the same name for another user', async () => {
    const user = await createSignedInUser();
    const other = await createSignedInUser();
    const create = (cookie: string, name: string) =>
      api()
        .post(`${BASE}/profiles`)
        .set('Cookie', cookie)
        .send({ name, appearance: DEFAULT_APPEARANCE });

    const office = await create(user.cookie, 'Office').expect(201);
    const clash = await create(user.cookie, 'office').expect(409);
    await create(other.cookie, 'Office').expect(201);
    const second = await create(user.cookie, 'Minimal').expect(201);
    const renameClash = await api()
      .patch(`${BASE}/profiles/${second.body.profile.id}`)
      .set('Cookie', user.cookie)
      .send({ name: 'OFFICE' })
      .expect(409);
    // Changing only the case of its own name is fine.
    await api()
      .patch(`${BASE}/profiles/${office.body.profile.id}`)
      .set('Cookie', user.cookie)
      .send({ name: 'OFFICE' })
      .expect(200);

    expect([clash.body.code, renameClash.body.code]).toEqual([
      'APPEARANCE_PROFILE_NAME_TAKEN',
      'APPEARANCE_PROFILE_NAME_TAKEN',
    ]);
  });

  it(`allows at most ${APPEARANCE_LIMITS.profilesMax} profiles per user`, async () => {
    const user = await createSignedInUser();
    for (let index = 0; index < APPEARANCE_LIMITS.profilesMax; index++) {
      await api()
        .post(`${BASE}/profiles`)
        .set('Cookie', user.cookie)
        .send({ name: `Profile ${index}`, appearance: DEFAULT_APPEARANCE })
        .expect(201);
    }

    const response = await api()
      .post(`${BASE}/profiles`)
      .set('Cookie', user.cookie)
      .send({ name: 'One too many', appearance: DEFAULT_APPEARANCE })
      .expect(409);

    expect(response.body.code).toBe('APPEARANCE_PROFILE_LIMIT');
    expect(await prisma.appearanceProfile.count()).toBe(APPEARANCE_LIMITS.profilesMax);
  });

  it.each([
    ['a blank name', { name: '   ', appearance: DEFAULT_APPEARANCE }, 'name'],
    ['a too long name', { name: 'n'.repeat(61), appearance: DEFAULT_APPEARANCE }, 'name'],
    ['a missing configuration', { name: 'X' }, 'appearance'],
    [
      'an invalid configuration',
      { name: 'X', appearance: { ...DEFAULT_APPEARANCE, theme: 'neon' } },
      'appearance.theme',
    ],
    [
      'extra fields inside the configuration',
      { name: 'X', appearance: { ...DEFAULT_APPEARANCE, organizationId: NON_EXISTENT_ID } },
      'appearance.organizationId',
    ],
    [
      'an owner id',
      { name: 'X', appearance: DEFAULT_APPEARANCE, userId: NON_EXISTENT_ID },
      'userId',
    ],
  ])('rejects a profile with %s', async (_case, body, field) => {
    const user = await createSignedInUser();

    const response = await api()
      .post(`${BASE}/profiles`)
      .set('Cookie', user.cookie)
      .send(body)
      .expect(400);

    expect(response.body.details.map((d: { field: string }) => d.field)).toContain(field);
    expect(await prisma.appearanceProfile.count()).toBe(0);
  });

  it("never shows, changes, applies, or deletes another user's profile or appearance", async () => {
    const alice = await createSignedInUser();
    const bob = await createSignedInUser();
    await api().put(BASE).set('Cookie', alice.cookie).send(NIGHT).expect(200);
    const aliceProfile = (
      await api()
        .post(`${BASE}/profiles`)
        .set('Cookie', alice.cookie)
        .send({ name: 'Alice', appearance: NIGHT })
        .expect(201)
    ).body.profile;
    const before = await prisma.appearanceProfile.findUniqueOrThrow({
      where: { id: aliceProfile.id },
    });

    const attempts = [
      () => api().patch(`${BASE}/profiles/${aliceProfile.id}`).send({ name: 'Mine now' }),
      () => api().delete(`${BASE}/profiles/${aliceProfile.id}`),
      () => api().post(`${BASE}/profiles/${aliceProfile.id}/apply`),
      () => api().patch(`${BASE}/profiles/not-a-uuid`).send({ name: 'X' }),
    ];
    for (const attempt of attempts) {
      const response = await attempt().set('Cookie', bob.cookie).expect(404);
      expect(response.body.code).toBe('APPEARANCE_PROFILE_NOT_FOUND');
    }

    expect((await profiles(bob.cookie)).body.profiles).toEqual([]);
    expect((await api().get(BASE).set('Cookie', bob.cookie)).body).toEqual({
      appearance: DEFAULT_APPEARANCE,
      updatedAt: null,
    });
    expect(
      await prisma.appearanceProfile.findUniqueOrThrow({ where: { id: aliceProfile.id } }),
    ).toEqual(before);
    expect((await api().get(BASE).set('Cookie', alice.cookie)).body.appearance.theme).toBe('ocean');
  });
});
