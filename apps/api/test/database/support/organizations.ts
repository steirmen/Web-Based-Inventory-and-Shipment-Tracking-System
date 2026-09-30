import type { MemberRole } from '@app/shared';
import { generateSecureToken, hashToken } from '../../../src/common/security/secure-token.js';
import { prisma } from './database.js';
import { createOrganization, createUser } from './factories.js';

/**
 * Fixtures for organization/RBAC HTTP tests. Users get a real session row
 * directly in the database (no HTTP login), so tests stay fast and are not
 * affected by the login rate limit.
 */

export interface SignedInUser {
  user: { id: string; name: string; email: string };
  /** `Cookie` header value for supertest. */
  cookie: string;
}

export interface TeamMember extends SignedInUser {
  memberId: string;
  role: MemberRole;
}

export async function createSignedInUser(
  data: { name?: string; email?: string } = {},
): Promise<SignedInUser> {
  const user = await createUser(data);
  const token = generateSecureToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  return {
    user: { id: user.id, name: user.name, email: user.email },
    cookie: `app_session=${token}`,
  };
}

export async function addMember(
  organizationId: string,
  signedIn: SignedInUser,
  role: MemberRole,
): Promise<TeamMember> {
  const member = await prisma.organizationMember.create({
    data: { organizationId, userId: signedIn.user.id, role },
  });
  return { ...signedIn, memberId: member.id, role };
}

/** An organization with one OWNER, one ADMIN, and one STAFF member, all signed in. */
export async function createTeam(slug?: string) {
  const organization = await createOrganization(slug ? { slug } : {});
  const owner = await addMember(organization.id, await createSignedInUser(), 'OWNER');
  const admin = await addMember(organization.id, await createSignedInUser(), 'ADMIN');
  const staff = await addMember(organization.id, await createSignedInUser(), 'STAFF');
  return { organization, owner, admin, staff };
}

export async function roleOf(memberId: string): Promise<MemberRole | undefined> {
  const member = await prisma.organizationMember.findUnique({ where: { id: memberId } });
  return member?.role;
}

export const NON_EXISTENT_ID = '01900000-0000-7000-8000-000000000000';
