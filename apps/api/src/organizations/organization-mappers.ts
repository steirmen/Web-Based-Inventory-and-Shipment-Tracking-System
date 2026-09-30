import type { Invitation, InvitationStatus, Member, MemberRole, Organization } from '@app/shared';

/** Prisma `select` shapes and their mapping to the public API contract (@app/shared). */

export const ORGANIZATION_SELECT = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function toOrganization(organization: {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}): Organization {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    createdAt: organization.createdAt.toISOString(),
    updatedAt: organization.updatedAt.toISOString(),
  };
}

/** Never includes password hashes or other user security fields. */
export const MEMBER_SELECT = {
  id: true,
  userId: true,
  role: true,
  createdAt: true,
  user: { select: { name: true, email: true } },
} as const;

export interface MemberRecord {
  id: string;
  userId: string;
  role: MemberRole;
  createdAt: Date;
  user: { name: string; email: string };
}

export function toMember(record: MemberRecord): Member {
  return {
    id: record.id,
    userId: record.userId,
    name: record.user.name,
    email: record.user.email,
    role: record.role,
    createdAt: record.createdAt.toISOString(),
  };
}

/** Never includes the token hash. */
export const INVITATION_SELECT = {
  id: true,
  invitedEmail: true,
  role: true,
  expiresAt: true,
  createdAt: true,
  acceptedAt: true,
  revokedAt: true,
  invitedBy: { select: { name: true } },
} as const;

interface InvitationState {
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

/** Derived from timestamps against server time; never stored. */
export function invitationStatus(invitation: InvitationState, now = new Date()): InvitationStatus {
  if (invitation.acceptedAt) return 'ACCEPTED';
  if (invitation.revokedAt) return 'REVOKED';
  if (invitation.expiresAt <= now) return 'EXPIRED';
  return 'PENDING';
}

export function toInvitation(
  record: InvitationState & {
    id: string;
    invitedEmail: string;
    role: MemberRole;
    createdAt: Date;
    invitedBy: { name: string } | null;
  },
  now = new Date(),
): Invitation {
  return {
    id: record.id,
    email: record.invitedEmail,
    role: record.role,
    status: invitationStatus(record, now),
    expiresAt: record.expiresAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    acceptedAt: record.acceptedAt?.toISOString() ?? null,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    invitedBy: record.invitedBy,
  };
}
