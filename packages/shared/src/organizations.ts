import type { MemberRole } from './rbac.js';

/** Input limits shared by API validation and client-side form validation. */
export const ORGANIZATION_LIMITS = {
  nameMaxLength: 100,
  slugMinLength: 3,
  slugMaxLength: 50,
} as const;

/** Lowercase letters and digits, separated by single hyphens (mirrors the DB CHECK constraint). */
export const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

/** An organization as seen by one of its members (`GET /organizations`). */
export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: MemberRole;
  memberCount: number;
  createdAt: string;
}

export interface MembershipInfo {
  role: MemberRole;
}

/** `GET /organizations/:id`, `PATCH /organizations/:id`, `POST /organizations`. */
export interface OrganizationResponse {
  organization: Organization;
  membership: MembershipInfo;
}

export interface OrganizationListResponse {
  organizations: OrganizationSummary[];
}

export interface CreateOrganizationRequest {
  name: string;
  slug: string;
}

export interface UpdateOrganizationRequest {
  name: string;
}

export interface Member {
  /** Membership id (used in member management URLs). */
  id: string;
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  createdAt: string;
}

export interface MemberListResponse {
  members: Member[];
}

export interface MemberResponse {
  member: Member;
}

export interface UpdateMemberRoleRequest {
  role: MemberRole;
}

export interface TransferOwnershipRequest {
  targetMemberId: string;
}

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface Invitation {
  id: string;
  email: string;
  role: MemberRole;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  invitedBy: { name: string } | null;
}

export interface InvitationListResponse {
  invitations: Invitation[];
}

export interface CreateInvitationRequest {
  email: string;
  role: MemberRole;
}

/** Returned once, when the invitation is created. `inviteUrl` contains the secret token. */
export interface CreatedInvitationResponse {
  invitation: {
    id: string;
    email: string;
    role: MemberRole;
    expiresAt: string;
    inviteUrl: string;
  };
}

/** `GET /invitations/:token`: only what the invite page needs to display. */
export interface PublicInvitationResponse {
  invitation: {
    organization: { id: string; name: string };
    email: string;
    role: MemberRole;
    expiresAt: string;
    status: InvitationStatus;
  };
}

export interface AcceptInvitationResponse {
  organization: { id: string; name: string; slug: string };
  membership: MembershipInfo;
}

export interface TransferOwnershipResponse {
  owner: Member;
  previousOwner: Member;
}
