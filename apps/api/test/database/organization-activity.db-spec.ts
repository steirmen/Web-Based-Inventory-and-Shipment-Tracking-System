import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from './support/database.js';
import { createHttpApp } from './support/http-app.js';
import { createSignedInUser, createTeam } from './support/organizations.js';

let app: INestApplication;
const api = () => request(app.getHttpServer());

beforeEach(async () => {
  ({ app } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

async function logsFor(organizationId: string) {
  return prisma.activityLog.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

describe('organization activity log', () => {
  it('records ORGANIZATION_CREATED and ORGANIZATION_UPDATED with the right actor and entity', async () => {
    const { user, cookie } = await createSignedInUser();
    const created = await api()
      .post('/organizations')
      .set('Cookie', cookie)
      .send({ name: 'Logged Co', slug: 'logged-co' })
      .expect(201);
    const organizationId = created.body.organization.id;
    await api()
      .patch(`/organizations/${organizationId}`)
      .set('Cookie', cookie)
      .send({ name: 'Logged Company' })
      .expect(200);

    const logs = await logsFor(organizationId);
    expect(logs).toEqual([
      expect.objectContaining({
        organizationId,
        actorUserId: user.id,
        action: 'ORGANIZATION_CREATED',
        entityType: 'Organization',
        entityId: organizationId,
        metadata: { name: 'Logged Co', slug: 'logged-co' },
      }),
      expect.objectContaining({
        actorUserId: user.id,
        action: 'ORGANIZATION_UPDATED',
        entityId: organizationId,
        metadata: { name: { from: 'Logged Co', to: 'Logged Company' } },
      }),
    ]);
  });

  it('records member, ownership, and invitation events — without any secrets', async () => {
    const { organization, owner, admin, staff } = await createTeam();
    const invitee = await createSignedInUser({ email: 'joiner@test.example' });
    const org = `/organizations/${organization.id}`;

    await api()
      .patch(`${org}/members/${staff.memberId}/role`)
      .set('Cookie', owner.cookie)
      .send({ role: 'ADMIN' })
      .expect(200);
    await api().delete(`${org}/members/${staff.memberId}`).set('Cookie', owner.cookie).expect(204);
    const invited = await api()
      .post(`${org}/invitations`)
      .set('Cookie', owner.cookie)
      .send({ email: 'joiner@test.example', role: 'STAFF' })
      .expect(201);
    const token = invited.body.invitation.inviteUrl.split('/invite/')[1];
    const toRevoke = await api()
      .post(`${org}/invitations`)
      .set('Cookie', owner.cookie)
      .send({ email: 'never@test.example', role: 'STAFF' })
      .expect(201);
    await api()
      .delete(`${org}/invitations/${toRevoke.body.invitation.id}`)
      .set('Cookie', owner.cookie)
      .expect(204);
    await api().post(`/invitations/${token}/accept`).set('Cookie', invitee.cookie).expect(200);
    await api()
      .post(`${org}/ownership/transfer`)
      .set('Cookie', owner.cookie)
      .send({ targetMemberId: admin.memberId })
      .expect(200);

    const logs = await logsFor(organization.id);
    const byAction = (action: string) => logs.filter((log) => log.action === action);

    expect(byAction('MEMBER_ROLE_CHANGED')).toEqual([
      expect.objectContaining({
        actorUserId: owner.user.id,
        entityType: 'OrganizationMember',
        entityId: staff.memberId,
        metadata: { userId: staff.user.id, from: 'STAFF', to: 'ADMIN' },
      }),
    ]);
    expect(byAction('MEMBER_REMOVED')).toEqual([
      expect.objectContaining({
        actorUserId: owner.user.id,
        entityId: staff.memberId,
        metadata: { userId: staff.user.id, email: staff.user.email, role: 'ADMIN' },
      }),
    ]);
    expect(byAction('INVITATION_CREATED')).toHaveLength(2);
    expect(byAction('INVITATION_CREATED')[0]).toMatchObject({
      actorUserId: owner.user.id,
      entityType: 'OrganizationInvitation',
      entityId: invited.body.invitation.id,
      metadata: { email: 'joiner@test.example', role: 'STAFF' },
    });
    expect(byAction('INVITATION_REVOKED')).toEqual([
      expect.objectContaining({
        actorUserId: owner.user.id,
        entityId: toRevoke.body.invitation.id,
      }),
    ]);
    expect(byAction('INVITATION_ACCEPTED')).toEqual([
      expect.objectContaining({
        actorUserId: invitee.user.id,
        entityId: invited.body.invitation.id,
        metadata: expect.objectContaining({ email: 'joiner@test.example', role: 'STAFF' }),
      }),
    ]);
    expect(byAction('OWNERSHIP_TRANSFERRED')).toEqual([
      expect.objectContaining({
        actorUserId: owner.user.id,
        entityType: 'Organization',
        entityId: organization.id,
        metadata: expect.objectContaining({ fromUserId: owner.user.id, toUserId: admin.user.id }),
      }),
    ]);

    const allLogs = JSON.stringify(logs);
    const invitations = await prisma.organizationInvitation.findMany();
    expect(allLogs).not.toContain(token);
    for (const invitation of invitations) {
      expect(allLogs).not.toContain(invitation.tokenHash);
    }
    expect(allLogs).not.toMatch(/password|argon2|app_session|tokenHash/i);
  });

  it('writes no activity when a mutation is rejected', async () => {
    const { organization, staff, owner } = await createTeam();

    await api()
      .patch(`/organizations/${organization.id}`)
      .set('Cookie', staff.cookie)
      .send({ name: 'Nope' })
      .expect(403);
    await api()
      .delete(`/organizations/${organization.id}/members/${owner.memberId}`)
      .set('Cookie', owner.cookie)
      .expect(403);

    expect(await logsFor(organization.id)).toEqual([]);
  });
});
