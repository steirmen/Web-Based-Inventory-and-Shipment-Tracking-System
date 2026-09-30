import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { prisma } from './support/database.js';
import { expectCheckViolation, expectUniqueViolation } from './support/db-errors.js';
import { createOrganization, createUser } from './support/factories.js';

/** Database-level rules for `organization_invitations` (independent of the API). */

const tokenHash = () => createHash('sha256').update(randomBytes(32)).digest('hex');
const tomorrow = () => new Date(Date.now() + 86_400_000);

async function base() {
  const organization = await createOrganization();
  const inviter = await createUser();
  return {
    organizationId: organization.id,
    invitedByUserId: inviter.id,
    invitedEmail: 'invitee@test.example',
    role: 'STAFF' as const,
    expiresAt: tomorrow(),
  };
}

describe('OrganizationInvitation', () => {
  it('rejects a duplicate token hash', async () => {
    const data = await base();
    const hash = tokenHash();
    await prisma.organizationInvitation.create({ data: { ...data, tokenHash: hash } });

    await expectUniqueViolation(
      prisma.organizationInvitation.create({ data: { ...data, tokenHash: hash } }),
      'organization_invitations_token_hash_key',
    );
  });

  it.each([
    [
      'a raw token as hash',
      { tokenHash: randomBytes(32).toString('base64url') },
      'organization_invitations_token_hash_format_check',
    ],
    ['an OWNER role', { role: 'OWNER' as const }, 'organization_invitations_role_not_owner_check'],
    [
      'a non-normalized email',
      { invitedEmail: 'Invitee@Test.example' },
      'organization_invitations_email_normalized_check',
    ],
    [
      'an expiry before creation',
      { expiresAt: new Date(Date.now() - 1000) },
      'organization_invitations_expires_after_creation_check',
    ],
    [
      'accepted AND revoked',
      { acceptedAt: new Date(), revokedAt: new Date() },
      'organization_invitations_accepted_or_revoked_check',
    ],
  ])('rejects %s', async (_case, override, constraint) => {
    const data = await base();

    await expectCheckViolation(
      prisma.organizationInvitation.create({
        data: { ...data, tokenHash: tokenHash(), ...override },
      }),
      constraint,
    );
  });

  it('keeps invitation history when the inviter is deleted', async () => {
    const data = await base();
    const invitation = await prisma.organizationInvitation.create({
      data: { ...data, tokenHash: tokenHash() },
    });

    await prisma.user.delete({ where: { id: data.invitedByUserId } });

    const after = await prisma.organizationInvitation.findUniqueOrThrow({
      where: { id: invitation.id },
    });
    expect(after.invitedByUserId).toBeNull();
  });

  it('is removed with its organization (no orphans)', async () => {
    const data = await base();
    await prisma.organizationInvitation.create({ data: { ...data, tokenHash: tokenHash() } });

    await prisma.organization.delete({ where: { id: data.organizationId } });

    expect(await prisma.organizationInvitation.count()).toBe(0);
  });
});
