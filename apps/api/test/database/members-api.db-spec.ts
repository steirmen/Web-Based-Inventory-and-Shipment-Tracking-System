import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from './support/database.js';
import { expectUniqueViolation } from './support/db-errors.js';
import { createHttpApp } from './support/http-app.js';
import {
  addMember,
  createSignedInUser,
  createTeam,
  roleOf,
  type TeamMember,
} from './support/organizations.js';

let app: INestApplication;
const api = () => request(app.getHttpServer());

beforeEach(async () => {
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

const changeRole = (organizationId: string, actor: TeamMember, memberId: string, role: string) =>
  api()
    .patch(`/organizations/${organizationId}/members/${memberId}/role`)
    .set('Cookie', actor.cookie)
    .send({ role });

const removeMember = (organizationId: string, actor: TeamMember, memberId: string) =>
  api().delete(`/organizations/${organizationId}/members/${memberId}`).set('Cookie', actor.cookie);

const transfer = (organizationId: string, actor: TeamMember, targetMemberId: string) =>
  api()
    .post(`/organizations/${organizationId}/ownership/transfer`)
    .set('Cookie', actor.cookie)
    .send({ targetMemberId });

describe('PATCH /organizations/:id/members/:memberId/role', () => {
  it('OWNER can change ADMIN → STAFF and STAFF → ADMIN', async () => {
    const { organization, owner, admin, staff } = await createTeam();

    const demoted = await changeRole(organization.id, owner, admin.memberId, 'STAFF').expect(200);
    await changeRole(organization.id, owner, staff.memberId, 'ADMIN').expect(200);

    expect(demoted.body.member).toMatchObject({ id: admin.memberId, role: 'STAFF' });
    expect(await roleOf(admin.memberId)).toBe('STAFF');
    expect(await roleOf(staff.memberId)).toBe('ADMIN');
  });

  it('ADMIN can manage a STAFF member (STAFF is the only role an ADMIN may assign)', async () => {
    const { organization, admin, staff } = await createTeam();

    const response = await changeRole(organization.id, admin, staff.memberId, 'STAFF').expect(200);

    expect(response.body.member.role).toBe('STAFF');
  });

  it('ADMIN cannot assign ADMIN', async () => {
    const { organization, admin, staff } = await createTeam();

    const response = await changeRole(organization.id, admin, staff.memberId, 'ADMIN').expect(403);

    expect(response.body.code).toBe('MEMBER_ROLE_CHANGE_FORBIDDEN');
    expect(await roleOf(staff.memberId)).toBe('STAFF');
  });

  it('ADMIN cannot change another ADMIN', async () => {
    const { organization, owner, admin } = await createTeam();
    const otherAdmin = await addMember(organization.id, await createSignedInUser(), 'ADMIN');

    await changeRole(organization.id, admin, otherAdmin.memberId, 'STAFF').expect(403);

    expect(await roleOf(otherAdmin.memberId)).toBe('ADMIN');
    expect(owner.role).toBe('OWNER');
  });

  it('STAFF cannot change roles', async () => {
    const { organization, admin, staff } = await createTeam();
    const otherStaff = await addMember(organization.id, await createSignedInUser(), 'STAFF');

    const response = await changeRole(organization.id, staff, otherStaff.memberId, 'ADMIN').expect(
      403,
    );

    expect(response.body.code).toBe('ORGANIZATION_FORBIDDEN');
    expect(await roleOf(admin.memberId)).toBe('ADMIN');
  });

  it('the OWNER role cannot be changed or assigned through this endpoint', async () => {
    const { organization, owner, admin } = await createTeam();

    const demoteOwner = await changeRole(organization.id, owner, owner.memberId, 'ADMIN').expect(
      403,
    );
    const makeOwner = await changeRole(organization.id, owner, admin.memberId, 'OWNER').expect(403);
    const adminDemotesOwner = await changeRole(
      organization.id,
      admin,
      owner.memberId,
      'STAFF',
    ).expect(403);

    expect(demoteOwner.body.code).toBe('OWNER_TRANSFER_REQUIRED');
    expect(makeOwner.body.code).toBe('MEMBER_ROLE_CHANGE_FORBIDDEN');
    expect(adminDemotesOwner.body.code).toBe('OWNER_TRANSFER_REQUIRED');
    expect(await roleOf(owner.memberId)).toBe('OWNER');
    expect(await roleOf(admin.memberId)).toBe('ADMIN');
  });

  it('rejects an invalid role value', async () => {
    const { organization, owner, staff } = await createTeam();

    const response = await changeRole(organization.id, owner, staff.memberId, 'SUPERUSER').expect(
      400,
    );

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns MEMBERSHIP_NOT_FOUND for unknown or malformed member ids', async () => {
    const { organization, owner } = await createTeam();

    for (const id of ['01900000-0000-7000-8000-000000000000', 'nope']) {
      const response = await changeRole(organization.id, owner, id, 'STAFF').expect(404);
      expect(response.body.code).toBe('MEMBERSHIP_NOT_FOUND');
    }
  });
});

describe('POST /organizations/:id/ownership/transfer', () => {
  it('OWNER transfers ownership: target becomes OWNER, previous owner becomes ADMIN', async () => {
    const { organization, owner, staff } = await createTeam();

    const response = await transfer(organization.id, owner, staff.memberId).expect(200);

    expect(response.body).toEqual({
      owner: expect.objectContaining({ id: staff.memberId, role: 'OWNER' }),
      previousOwner: expect.objectContaining({ id: owner.memberId, role: 'ADMIN' }),
    });
    expect(await roleOf(staff.memberId)).toBe('OWNER');
    expect(await roleOf(owner.memberId)).toBe('ADMIN');
    expect(
      await prisma.organizationMember.count({
        where: { organizationId: organization.id, role: 'OWNER' },
      }),
    ).toBe(1);
  });

  it.each(['admin', 'staff'] as const)('%s cannot transfer ownership', async (who) => {
    const team = await createTeam();

    const response = await transfer(team.organization.id, team[who], team[who].memberId).expect(
      403,
    );

    expect(response.body.code).toBe('ORGANIZATION_FORBIDDEN');
    expect(await roleOf(team.owner.memberId)).toBe('OWNER');
  });

  it('rejects a target from another organization', async () => {
    const a = await createTeam('org-a');
    const b = await createTeam('org-b');

    const response = await transfer(a.organization.id, a.owner, b.staff.memberId).expect(404);

    expect(response.body.code).toBe('MEMBERSHIP_NOT_FOUND');
    expect(await roleOf(a.owner.memberId)).toBe('OWNER');
    expect(await roleOf(b.staff.memberId)).toBe('STAFF');
  });

  it('rejects transferring to the current owner', async () => {
    const { organization, owner } = await createTeam();

    await transfer(organization.id, owner, owner.memberId).expect(409);

    expect(await roleOf(owner.memberId)).toBe('OWNER');
  });

  it('a former owner cannot transfer again (the check uses the current role)', async () => {
    const { organization, owner, admin, staff } = await createTeam();
    await transfer(organization.id, owner, admin.memberId).expect(200);

    await transfer(organization.id, owner, staff.memberId).expect(403);

    expect(await roleOf(admin.memberId)).toBe('OWNER');
    expect(await roleOf(staff.memberId)).toBe('STAFF');
  });
});

describe('database owner integrity', () => {
  it('the partial unique index allows at most one OWNER per organization', async () => {
    const { admin } = await createTeam();

    await expectUniqueViolation(
      prisma.organizationMember.update({ where: { id: admin.memberId }, data: { role: 'OWNER' } }),
      'organization_members_one_owner_per_organization',
    );
  });

  it('different organizations each have their own owner', async () => {
    const a = await createTeam('org-a');
    const b = await createTeam('org-b');

    expect(await roleOf(a.owner.memberId)).toBe('OWNER');
    expect(await roleOf(b.owner.memberId)).toBe('OWNER');
  });
});

describe('DELETE /organizations/:id/members/:memberId', () => {
  it('OWNER can remove ADMIN and STAFF; the users and their other memberships remain', async () => {
    const { organization, owner, admin, staff } = await createTeam();
    const elsewhere = await prisma.organization.create({ data: { name: 'Else', slug: 'else' } });
    await addMember(elsewhere.id, staff, 'OWNER');

    await removeMember(organization.id, owner, admin.memberId).expect(204);
    await removeMember(organization.id, owner, staff.memberId).expect(204);

    expect(
      await prisma.organizationMember.count({ where: { organizationId: organization.id } }),
    ).toBe(1);
    expect(await prisma.user.count({ where: { id: { in: [admin.user.id, staff.user.id] } } })).toBe(
      2,
    );
    expect(await prisma.organizationMember.count({ where: { userId: staff.user.id } })).toBe(1);
  });

  it('ADMIN can remove STAFF', async () => {
    const { organization, admin, staff } = await createTeam();

    await removeMember(organization.id, admin, staff.memberId).expect(204);

    expect(await roleOf(staff.memberId)).toBeUndefined();
  });

  it('ADMIN cannot remove another ADMIN', async () => {
    const { organization, admin } = await createTeam();
    const otherAdmin = await addMember(organization.id, await createSignedInUser(), 'ADMIN');

    const response = await removeMember(organization.id, admin, otherAdmin.memberId).expect(403);

    expect(response.body.code).toBe('MEMBER_REMOVAL_FORBIDDEN');
    expect(await roleOf(otherAdmin.memberId)).toBe('ADMIN');
  });

  it('STAFF cannot remove anyone', async () => {
    const { organization, staff } = await createTeam();
    const otherStaff = await addMember(organization.id, await createSignedInUser(), 'STAFF');

    const response = await removeMember(organization.id, staff, otherStaff.memberId).expect(403);

    expect(response.body.code).toBe('ORGANIZATION_FORBIDDEN');
  });

  it('nobody can remove the OWNER — not even the owner', async () => {
    const { organization, owner, admin } = await createTeam();

    for (const actor of [owner, admin]) {
      const response = await removeMember(organization.id, actor, owner.memberId).expect(403);
      expect(response.body.code).toBe('OWNER_TRANSFER_REQUIRED');
    }
    expect(await roleOf(owner.memberId)).toBe('OWNER');
  });

  it('a removed member immediately loses access', async () => {
    const { organization, owner, staff } = await createTeam();

    await removeMember(organization.id, owner, staff.memberId).expect(204);

    await api().get(`/organizations/${organization.id}`).set('Cookie', staff.cookie).expect(404);
  });
});
