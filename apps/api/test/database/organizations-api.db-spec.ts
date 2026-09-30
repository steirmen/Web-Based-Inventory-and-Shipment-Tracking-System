import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from './support/database.js';
import { createHttpApp } from './support/http-app.js';
import {
  addMember,
  createSignedInUser,
  createTeam,
  NON_EXISTENT_ID,
} from './support/organizations.js';

let app: INestApplication;
const api = () => request(app.getHttpServer());

beforeEach(async () => {
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

describe('POST /organizations', () => {
  it('creates the organization and makes the creator OWNER', async () => {
    const { user, cookie } = await createSignedInUser();

    const response = await api()
      .post('/organizations')
      .set('Cookie', cookie)
      .send({ name: '  Acme Supplies  ', slug: 'acme-supplies' })
      .expect(201);

    expect(response.body).toEqual({
      organization: {
        id: expect.any(String),
        name: 'Acme Supplies',
        slug: 'acme-supplies',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
      membership: { role: 'OWNER' },
    });
    const members = await prisma.organizationMember.findMany({
      where: { organizationId: response.body.organization.id },
    });
    expect(members).toEqual([expect.objectContaining({ userId: user.id, role: 'OWNER' })]);
  });

  it('rejects a duplicate slug with ORGANIZATION_SLUG_TAKEN and creates nothing', async () => {
    const first = await createSignedInUser();
    const second = await createSignedInUser();
    await api()
      .post('/organizations')
      .set('Cookie', first.cookie)
      .send({ name: 'First', slug: 'taken-slug' })
      .expect(201);

    const response = await api()
      .post('/organizations')
      .set('Cookie', second.cookie)
      .send({ name: 'Second', slug: 'taken-slug' })
      .expect(409);

    expect(response.body.code).toBe('ORGANIZATION_SLUG_TAKEN');
    expect(await prisma.organization.count()).toBe(1);
    expect(await prisma.organizationMember.count({ where: { userId: second.user.id } })).toBe(0);
  });

  it('does not create duplicate memberships when the request is retried', async () => {
    const { user, cookie } = await createSignedInUser();
    const body = { name: 'Retry Co', slug: 'retry-co' };

    await api().post('/organizations').set('Cookie', cookie).send(body).expect(201);
    await api().post('/organizations').set('Cookie', cookie).send(body).expect(409);

    expect(await prisma.organizationMember.count({ where: { userId: user.id } })).toBe(1);
  });

  it.each([
    ['uppercase', 'Acme'],
    ['spaces', 'acme co'],
    ['double hyphen', 'acme--co'],
    ['leading hyphen', '-acme'],
    ['too short', 'ab'],
    ['too long', 'a'.repeat(51)],
    ['non-ASCII', 'açme'],
  ])('rejects an invalid slug (%s)', async (_case, slug) => {
    const { cookie } = await createSignedInUser();

    const response = await api()
      .post('/organizations')
      .set('Cookie', cookie)
      .send({ name: 'Valid Name', slug })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.details.map((d: { field: string }) => d.field)).toContain('slug');
  });

  it.each([
    ['blank', '   '],
    ['too long', 'n'.repeat(101)],
  ])('rejects a %s name', async (_case, name) => {
    const { cookie } = await createSignedInUser();

    await api()
      .post('/organizations')
      .set('Cookie', cookie)
      .send({ name, slug: 'valid-slug' })
      .expect(400);
  });

  it('rejects unauthenticated requests', async () => {
    const response = await api()
      .post('/organizations')
      .send({ name: 'Anon', slug: 'anon' })
      .expect(401);

    expect(response.body.code).toBe('AUTH_UNAUTHENTICATED');
    expect(await prisma.organization.count()).toBe(0);
  });
});

describe('GET /organizations', () => {
  it('lists only the caller’s organizations with role and member count, ordered by name', async () => {
    const team = await createTeam('zulu-team');
    const other = await createTeam('other-team');
    const alpha = await prisma.organization.create({ data: { name: 'Alpha', slug: 'alpha' } });
    await addMember(alpha.id, team.staff, 'ADMIN');

    const response = await api().get('/organizations').set('Cookie', team.staff.cookie).expect(200);

    expect(response.body.organizations).toEqual([
      {
        id: alpha.id,
        name: 'Alpha',
        slug: 'alpha',
        role: 'ADMIN',
        memberCount: 1,
        createdAt: expect.any(String),
      },
      expect.objectContaining({ id: team.organization.id, role: 'STAFF', memberCount: 3 }),
    ]);
    const ids = response.body.organizations.map((o: { id: string }) => o.id);
    expect(ids).not.toContain(other.organization.id);
  });

  it('returns an empty list for a user without organizations', async () => {
    const { cookie } = await createSignedInUser();

    const response = await api().get('/organizations').set('Cookie', cookie).expect(200);

    expect(response.body).toEqual({ organizations: [] });
  });
});

describe('GET /organizations/:organizationId', () => {
  it('returns the organization and the caller’s role to a member', async () => {
    const { organization, staff } = await createTeam();

    const response = await api()
      .get(`/organizations/${organization.id}`)
      .set('Cookie', staff.cookie)
      .expect(200);

    expect(response.body).toEqual({
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
      membership: { role: 'STAFF' },
    });
  });

  it('returns the same 404 for a non-member, an unknown id, and a malformed id', async () => {
    const { organization } = await createTeam();
    const outsider = await createSignedInUser();

    const responses = await Promise.all(
      [organization.id, NON_EXISTENT_ID, 'not-a-uuid', "1' OR '1'='1"].map((id) =>
        api()
          .get(`/organizations/${encodeURIComponent(id)}`)
          .set('Cookie', outsider.cookie),
      ),
    );

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        statusCode: 404,
        code: 'ORGANIZATION_NOT_FOUND',
        message: "Workspace not found or you don't have access to it.",
      });
    }
  });

  it('requires authentication', async () => {
    const { organization } = await createTeam();

    await api().get(`/organizations/${organization.id}`).expect(401);
  });
});

describe('PATCH /organizations/:organizationId', () => {
  it.each(['owner', 'admin'] as const)('allows %s to rename the organization', async (who) => {
    const team = await createTeam();

    const response = await api()
      .patch(`/organizations/${team.organization.id}`)
      .set('Cookie', team[who].cookie)
      .send({ name: '  Renamed Workspace ' })
      .expect(200);

    expect(response.body.organization.name).toBe('Renamed Workspace');
    expect(response.body.organization.slug).toBe(team.organization.slug);
  });

  it('forbids STAFF from renaming', async () => {
    const team = await createTeam();

    const response = await api()
      .patch(`/organizations/${team.organization.id}`)
      .set('Cookie', team.staff.cookie)
      .send({ name: 'Hijacked' })
      .expect(403);

    expect(response.body.code).toBe('ORGANIZATION_FORBIDDEN');
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: team.organization.id },
    });
    expect(organization.name).toBe(team.organization.name);
  });

  it('rejects slug changes (slug is immutable)', async () => {
    const team = await createTeam();

    const response = await api()
      .patch(`/organizations/${team.organization.id}`)
      .set('Cookie', team.owner.cookie)
      .send({ name: 'New Name', slug: 'new-slug' })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: team.organization.id },
    });
    expect(organization).toMatchObject({
      slug: team.organization.slug,
      name: team.organization.name,
    });
  });
});

describe('GET /organizations/:organizationId/members', () => {
  it('lets every member view the member list with safe fields only', async () => {
    const team = await createTeam();

    for (const member of [team.owner, team.admin, team.staff]) {
      const response = await api()
        .get(`/organizations/${team.organization.id}/members`)
        .set('Cookie', member.cookie)
        .expect(200);

      expect(response.body.members.map((m: { role: string }) => m.role)).toEqual([
        'OWNER',
        'ADMIN',
        'STAFF',
      ]);
      expect(Object.keys(response.body.members[0]).sort()).toEqual(
        ['createdAt', 'email', 'id', 'name', 'role', 'userId'].sort(),
      );
      expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|tokenHash|argon2/);
    }
  });

  it('rejects non-members', async () => {
    const team = await createTeam();
    const outsider = await createSignedInUser();

    await api()
      .get(`/organizations/${team.organization.id}/members`)
      .set('Cookie', outsider.cookie)
      .expect(404);
  });
});

describe('tenant isolation', () => {
  it('user A cannot read or change anything in organization B, even with its ids', async () => {
    const a = await createTeam('org-a');
    const b = await createTeam('org-b');
    const orgB = `/organizations/${b.organization.id}`;
    const pendingInB = await prisma.organizationInvitation.create({
      data: {
        organizationId: b.organization.id,
        invitedEmail: 'pending@test.example',
        role: 'STAFF',
        tokenHash: 'a'.repeat(64),
        invitedByUserId: b.owner.user.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    // Built lazily: supertest starts a server per request.
    const attempts = [
      () => api().get(orgB),
      () => api().patch(orgB).send({ name: 'Taken over' }),
      () => api().get(`${orgB}/members`),
      () => api().patch(`${orgB}/members/${b.staff.memberId}/role`).send({ role: 'ADMIN' }),
      () => api().delete(`${orgB}/members/${b.staff.memberId}`),
      () => api().post(`${orgB}/ownership/transfer`).send({ targetMemberId: a.owner.memberId }),
      () => api().get(`${orgB}/invitations`),
      () => api().post(`${orgB}/invitations`).send({ email: 'x@test.example', role: 'STAFF' }),
      () => api().delete(`${orgB}/invitations/${pendingInB.id}`),
    ];

    for (const attempt of attempts) {
      const response = await attempt().set('Cookie', a.owner.cookie);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('ORGANIZATION_NOT_FOUND');
      expect(JSON.stringify(response.body)).not.toContain(b.organization.name);
    }

    // Nothing in organization B changed.
    const orgBAfter = await prisma.organization.findUniqueOrThrow({
      where: { id: b.organization.id },
    });
    expect(orgBAfter.name).toBe(b.organization.name);
    expect(
      await prisma.organizationMember.count({ where: { organizationId: b.organization.id } }),
    ).toBe(3);
    expect(
      (await prisma.organizationInvitation.findUniqueOrThrow({ where: { id: pendingInB.id } }))
        .revokedAt,
    ).toBeNull();
  });

  it('a member id from another organization is not found inside the caller’s organization', async () => {
    const a = await createTeam('org-a');
    const b = await createTeam('org-b');

    const response = await api()
      .delete(`/organizations/${a.organization.id}/members/${b.staff.memberId}`)
      .set('Cookie', a.owner.cookie)
      .expect(404);

    expect(response.body.code).toBe('MEMBERSHIP_NOT_FOUND');
    expect(await prisma.organizationMember.count({ where: { id: b.staff.memberId } })).toBe(1);
  });
});
