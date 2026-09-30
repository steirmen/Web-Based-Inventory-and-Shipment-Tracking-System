import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from './support/database.js';
import { type CapturingLogger, createHttpApp } from './support/http-app.js';
import {
  createSignedInUser,
  createTeam,
  roleOf,
  type SignedInUser,
  type TeamMember,
} from './support/organizations.js';

let app: INestApplication;
let logger: CapturingLogger;
const api = () => request(app.getHttpServer());

beforeEach(async () => {
  ({ app, logger } = await createHttpApp());
});

afterEach(async () => {
  await app.close();
});

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const tokenOf = (inviteUrl: string) => inviteUrl.split('/invite/')[1];

function invite(organizationId: string, actor: SignedInUser, email: string, role = 'STAFF') {
  return api()
    .post(`/organizations/${organizationId}/invitations`)
    .set('Cookie', actor.cookie)
    .send({ email, role });
}

/** Creates an invitation over HTTP and returns its id and raw token. */
async function createInvitation(
  organizationId: string,
  actor: TeamMember,
  email: string,
  role = 'STAFF',
) {
  const response = await invite(organizationId, actor, email, role).expect(201);
  return {
    id: response.body.invitation.id as string,
    token: tokenOf(response.body.invitation.inviteUrl),
  };
}

describe('POST /organizations/:id/invitations', () => {
  it('OWNER can invite STAFF and ADMIN; returns a one-time invite link', async () => {
    const { organization, owner } = await createTeam();

    const staffInvite = await invite(
      organization.id,
      owner,
      'new.staff@test.example',
      'STAFF',
    ).expect(201);
    await invite(organization.id, owner, 'new.admin@test.example', 'ADMIN').expect(201);

    expect(staffInvite.body).toEqual({
      invitation: {
        id: expect.any(String),
        email: 'new.staff@test.example',
        role: 'STAFF',
        expiresAt: expect.any(String),
        inviteUrl: expect.stringMatching(/^http:\/\/localhost:5173\/invite\/[A-Za-z0-9_-]{43}$/),
      },
    });
    const lifetime = Date.parse(staffInvite.body.invitation.expiresAt) - Date.now();
    expect(lifetime).toBeGreaterThan(7 * 86_400_000 - 60_000);
    expect(lifetime).toBeLessThanOrEqual(7 * 86_400_000);
  });

  it('ADMIN can invite STAFF but not ADMIN', async () => {
    const { organization, admin } = await createTeam();

    await invite(organization.id, admin, 'staff2@test.example', 'STAFF').expect(201);
    const response = await invite(organization.id, admin, 'admin2@test.example', 'ADMIN').expect(
      403,
    );

    expect(response.body.code).toBe('INVITATION_ROLE_FORBIDDEN');
  });

  it('nobody can invite an OWNER', async () => {
    const { organization, owner } = await createTeam();

    const response = await invite(organization.id, owner, 'boss@test.example', 'OWNER').expect(403);

    expect(response.body.code).toBe('INVITATION_ROLE_FORBIDDEN');
    expect(await prisma.organizationInvitation.count()).toBe(0);
  });

  it('STAFF cannot invite', async () => {
    const { organization, staff } = await createTeam();

    const response = await invite(organization.id, staff, 'x@test.example').expect(403);

    expect(response.body.code).toBe('ORGANIZATION_FORBIDDEN');
  });

  it('rejects inviting an existing member (including the owner), using the normalized email', async () => {
    const { organization, owner, staff } = await createTeam();

    for (const email of [`  ${staff.user.email.toUpperCase()} `, owner.user.email]) {
      const response = await invite(organization.id, owner, email).expect(409);
      expect(response.body.code).toBe('MEMBERSHIP_ALREADY_EXISTS');
    }
  });

  it('normalizes the email and rejects a second pending invitation for it', async () => {
    const { organization, owner } = await createTeam();

    const first = await invite(organization.id, owner, '  Mixed.Case@Test.EXAMPLE ').expect(201);
    const second = await invite(organization.id, owner, 'mixed.case@test.example').expect(409);

    expect(first.body.invitation.email).toBe('mixed.case@test.example');
    expect(second.body.code).toBe('INVITATION_ALREADY_PENDING');
  });

  it('stores only the SHA-256 hash of a random token, and never logs the token', async () => {
    const { organization, owner } = await createTeam();
    const consoleSpy = vi.spyOn(console, 'log');

    const a = await createInvitation(organization.id, owner, 'a@test.example');
    const b = await createInvitation(organization.id, owner, 'b@test.example');

    expect(a.token).not.toBe(b.token);
    const stored = await prisma.organizationInvitation.findUniqueOrThrow({ where: { id: a.id } });
    expect(stored.tokenHash).toBe(sha256(a.token));
    expect(await prisma.organizationInvitation.count({ where: { tokenHash: a.token } })).toBe(0);

    const logged = [...logger.lines, ...consoleSpy.mock.calls.flat().map(String)].join('\n');
    expect(logged).not.toContain(a.token);
    expect(logged).not.toContain(b.token);
    const activity = await prisma.activityLog.findMany();
    expect(JSON.stringify(activity)).not.toContain(a.token);
    expect(JSON.stringify(activity)).not.toContain(stored.tokenHash);
  });

  it('validates the input', async () => {
    const { organization, owner } = await createTeam();

    const response = await invite(organization.id, owner, 'not-an-email', 'STAFF').expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /organizations/:id/invitations', () => {
  it('lists invitations with a derived status and no secrets (OWNER/ADMIN only)', async () => {
    const { organization, owner, admin, staff } = await createTeam();
    const pending = await createInvitation(organization.id, owner, 'pending@test.example');
    const revoked = await createInvitation(organization.id, owner, 'revoked@test.example');
    await prisma.organizationInvitation.update({
      where: { id: revoked.id },
      data: { revokedAt: new Date() },
    });

    const response = await api()
      .get(`/organizations/${organization.id}/invitations`)
      .set('Cookie', admin.cookie)
      .expect(200);

    const byId = Object.fromEntries(
      response.body.invitations.map((i: { id: string; status: string }) => [i.id, i]),
    );
    expect(byId[pending.id]).toMatchObject({
      email: 'pending@test.example',
      role: 'STAFF',
      status: 'PENDING',
      invitedBy: { name: owner.user.name },
    });
    expect(byId[revoked.id].status).toBe('REVOKED');
    expect(JSON.stringify(response.body)).not.toMatch(/tokenHash|token_hash|inviteUrl/);
    expect(JSON.stringify(response.body)).not.toContain(pending.token);

    await api()
      .get(`/organizations/${organization.id}/invitations`)
      .set('Cookie', staff.cookie)
      .expect(403);
  });
});

describe('DELETE /organizations/:id/invitations/:invitationId', () => {
  it('revokes a pending invitation idempotently', async () => {
    const { organization, owner } = await createTeam();
    const { id, token } = await createInvitation(organization.id, owner, 'bye@test.example');
    const url = `/organizations/${organization.id}/invitations/${id}`;

    await api().delete(url).set('Cookie', owner.cookie).expect(204);
    const firstRevokedAt = (
      await prisma.organizationInvitation.findUniqueOrThrow({ where: { id } })
    ).revokedAt;
    await api().delete(url).set('Cookie', owner.cookie).expect(204);

    expect(firstRevokedAt).toBeInstanceOf(Date);
    expect(
      (await prisma.organizationInvitation.findUniqueOrThrow({ where: { id } })).revokedAt,
    ).toEqual(firstRevokedAt);
    const view = await api().get(`/invitations/${token}`).expect(410);
    expect(view.body.code).toBe('INVITATION_REVOKED');
  });

  it('ADMIN cannot revoke an ADMIN invitation; STAFF cannot revoke at all', async () => {
    const { organization, owner, admin, staff } = await createTeam();
    const adminInvite = await createInvitation(
      organization.id,
      owner,
      'future.admin@test.example',
      'ADMIN',
    );
    const staffInvite = await createInvitation(
      organization.id,
      owner,
      'future.staff@test.example',
      'STAFF',
    );

    const byAdmin = await api()
      .delete(`/organizations/${organization.id}/invitations/${adminInvite.id}`)
      .set('Cookie', admin.cookie)
      .expect(403);
    await api()
      .delete(`/organizations/${organization.id}/invitations/${staffInvite.id}`)
      .set('Cookie', staff.cookie)
      .expect(403);
    await api()
      .delete(`/organizations/${organization.id}/invitations/${staffInvite.id}`)
      .set('Cookie', admin.cookie)
      .expect(204);

    expect(byAdmin.body.code).toBe('INVITATION_ROLE_FORBIDDEN');
    expect(
      (await prisma.organizationInvitation.findUniqueOrThrow({ where: { id: adminInvite.id } }))
        .revokedAt,
    ).toBeNull();
  });

  it('returns INVITATION_NOT_FOUND for another organization’s invitation', async () => {
    const a = await createTeam('org-a');
    const b = await createTeam('org-b');
    const foreign = await createInvitation(b.organization.id, b.owner, 'x@test.example');

    const response = await api()
      .delete(`/organizations/${a.organization.id}/invitations/${foreign.id}`)
      .set('Cookie', a.owner.cookie)
      .expect(404);

    expect(response.body.code).toBe('INVITATION_NOT_FOUND');
  });
});

describe('GET /invitations/:token', () => {
  it('shows only what the invite page needs, without authentication', async () => {
    const { organization, owner } = await createTeam();
    const { token } = await createInvitation(
      organization.id,
      owner,
      'viewer@test.example',
      'ADMIN',
    );

    const response = await api().get(`/invitations/${token}`).expect(200);

    expect(response.body).toEqual({
      invitation: {
        organization: { id: organization.id, name: organization.name },
        email: 'viewer@test.example',
        role: 'ADMIN',
        expiresAt: expect.any(String),
        status: 'PENDING',
      },
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it.each([
    ['unknown', () => 'x'.repeat(43), 404, 'INVITATION_NOT_FOUND'],
    ['malformed', () => 'short', 404, 'INVITATION_NOT_FOUND'],
  ])('rejects an %s token', async (_case, token, status, code) => {
    const response = await api().get(`/invitations/${token()}`).expect(status);

    expect(response.body.code).toBe(code);
  });

  it('rejects an expired invitation', async () => {
    const { organization, owner } = await createTeam();
    const { id, token } = await createInvitation(organization.id, owner, 'late@test.example');
    await prisma.organizationInvitation.update({
      where: { id },
      data: {
        createdAt: new Date(Date.now() - 10 * 86_400_000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const response = await api().get(`/invitations/${token}`).expect(410);

    expect(response.body.code).toBe('INVITATION_EXPIRED');
  });
});

describe('POST /invitations/:token/accept', () => {
  it('adds the invited user with the invited role and marks the invitation accepted', async () => {
    const { organization, owner } = await createTeam();
    const invitee = await createSignedInUser({ email: 'invitee@test.example' });
    const { id, token } = await createInvitation(
      organization.id,
      owner,
      'INVITEE@test.example',
      'ADMIN',
    );

    const response = await api()
      .post(`/invitations/${token}/accept`)
      .set('Cookie', invitee.cookie)
      .expect(200);

    expect(response.body).toEqual({
      organization: { id: organization.id, name: organization.name, slug: organization.slug },
      membership: { role: 'ADMIN' },
    });
    const membership = await prisma.organizationMember.findUniqueOrThrow({
      where: {
        organizationId_userId: { organizationId: organization.id, userId: invitee.user.id },
      },
    });
    expect(membership.role).toBe('ADMIN');
    expect(
      (await prisma.organizationInvitation.findUniqueOrThrow({ where: { id } })).acceptedAt,
    ).toBeInstanceOf(Date);

    const members = await api()
      .get(`/organizations/${organization.id}/members`)
      .set('Cookie', owner.cookie)
      .expect(200);
    expect(members.body.members.map((m: { email: string }) => m.email)).toContain(
      'invitee@test.example',
    );
  });

  it('rejects a signed-in user whose email does not match, without side effects', async () => {
    const { organization, owner } = await createTeam();
    const stranger = await createSignedInUser({ email: 'stranger@test.example' });
    const { id, token } = await createInvitation(organization.id, owner, 'intended@test.example');

    const response = await api()
      .post(`/invitations/${token}/accept`)
      .set('Cookie', stranger.cookie)
      .expect(403);

    expect(response.body.code).toBe('INVITATION_EMAIL_MISMATCH');
    expect(await prisma.organizationMember.count({ where: { userId: stranger.user.id } })).toBe(0);
    expect(
      (await prisma.organizationInvitation.findUniqueOrThrow({ where: { id } })).acceptedAt,
    ).toBeNull();
  });

  it('cannot be reused once accepted', async () => {
    const { organization, owner } = await createTeam();
    const invitee = await createSignedInUser({ email: 'once@test.example' });
    const { token } = await createInvitation(organization.id, owner, 'once@test.example');

    await api().post(`/invitations/${token}/accept`).set('Cookie', invitee.cookie).expect(200);
    const again = await api()
      .post(`/invitations/${token}/accept`)
      .set('Cookie', invitee.cookie)
      .expect(409);

    expect(again.body.code).toBe('INVITATION_ALREADY_ACCEPTED');
    expect(await prisma.organizationMember.count({ where: { userId: invitee.user.id } })).toBe(1);
  });

  it('rejects revoked and expired invitations', async () => {
    const { organization, owner } = await createTeam();
    const invitee = await createSignedInUser({ email: 'late@test.example' });
    const revoked = await createInvitation(organization.id, owner, 'late@test.example');
    await prisma.organizationInvitation.update({
      where: { id: revoked.id },
      data: { revokedAt: new Date() },
    });
    const expired = await createInvitation(organization.id, owner, 'late@test.example');
    await prisma.organizationInvitation.update({
      where: { id: expired.id },
      data: {
        createdAt: new Date(Date.now() - 10 * 86_400_000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const revokedResponse = await api()
      .post(`/invitations/${revoked.token}/accept`)
      .set('Cookie', invitee.cookie)
      .expect(410);
    const expiredResponse = await api()
      .post(`/invitations/${expired.token}/accept`)
      .set('Cookie', invitee.cookie)
      .expect(410);

    expect(revokedResponse.body.code).toBe('INVITATION_REVOKED');
    expect(expiredResponse.body.code).toBe('INVITATION_EXPIRED');
    expect(await prisma.organizationMember.count({ where: { userId: invitee.user.id } })).toBe(0);
  });

  it('rolls back the acceptance when the membership cannot be created', async () => {
    const { organization, owner, staff } = await createTeam();
    // An invitation for someone who is (by now) already a member.
    const invitation = await prisma.organizationInvitation.create({
      data: {
        organizationId: organization.id,
        invitedEmail: staff.user.email,
        role: 'ADMIN',
        tokenHash: sha256('x'.repeat(43)),
        invitedByUserId: owner.user.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const response = await api()
      .post(`/invitations/${'x'.repeat(43)}/accept`)
      .set('Cookie', staff.cookie)
      .expect(409);

    expect(response.body.code).toBe('MEMBERSHIP_ALREADY_EXISTS');
    expect(
      (await prisma.organizationInvitation.findUniqueOrThrow({ where: { id: invitation.id } }))
        .acceptedAt,
    ).toBeNull();
    expect(await roleOf(staff.memberId)).toBe('STAFF');
  });

  it('requires authentication', async () => {
    const { organization, owner } = await createTeam();
    const { token } = await createInvitation(organization.id, owner, 'anon@test.example');

    const response = await api().post(`/invitations/${token}/accept`).expect(401);

    expect(response.body.code).toBe('AUTH_UNAUTHENTICATED');
  });
});
