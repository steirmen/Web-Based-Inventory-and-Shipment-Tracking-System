import type {
  CreatedInvitationResponse,
  CreateInvitationRequest,
  CreateOrganizationRequest,
  InvitationListResponse,
  MemberListResponse,
  MemberResponse,
  MemberRole,
  OrganizationListResponse,
  OrganizationResponse,
  TransferOwnershipResponse,
  UpdateOrganizationRequest,
} from '@app/shared';
import { apiRequest } from './http-client';

export const organizationKeys = {
  all: ['organizations'] as const,
  list: () => [...organizationKeys.all, 'list'] as const,
  detail: (organizationId: string) => [...organizationKeys.all, 'detail', organizationId] as const,
  members: (organizationId: string) =>
    [...organizationKeys.detail(organizationId), 'members'] as const,
  invitations: (organizationId: string) =>
    [...organizationKeys.detail(organizationId), 'invitations'] as const,
};

const base = (organizationId: string) => `/organizations/${encodeURIComponent(organizationId)}`;

export function listOrganizations(options?: { signal?: AbortSignal }) {
  return apiRequest<OrganizationListResponse>('/organizations', { signal: options?.signal });
}

export function createOrganization(input: CreateOrganizationRequest) {
  return apiRequest<OrganizationResponse>('/organizations', { method: 'POST', body: input });
}

export function getOrganization(organizationId: string, options?: { signal?: AbortSignal }) {
  return apiRequest<OrganizationResponse>(base(organizationId), { signal: options?.signal });
}

export function updateOrganization(organizationId: string, input: UpdateOrganizationRequest) {
  return apiRequest<OrganizationResponse>(base(organizationId), { method: 'PATCH', body: input });
}

export function listMembers(organizationId: string, options?: { signal?: AbortSignal }) {
  return apiRequest<MemberListResponse>(`${base(organizationId)}/members`, {
    signal: options?.signal,
  });
}

export function changeMemberRole(organizationId: string, memberId: string, role: MemberRole) {
  return apiRequest<MemberResponse>(`${base(organizationId)}/members/${memberId}/role`, {
    method: 'PATCH',
    body: { role },
  });
}

export function removeMember(organizationId: string, memberId: string) {
  return apiRequest<void>(`${base(organizationId)}/members/${memberId}`, { method: 'DELETE' });
}

export function transferOwnership(organizationId: string, targetMemberId: string) {
  return apiRequest<TransferOwnershipResponse>(`${base(organizationId)}/ownership/transfer`, {
    method: 'POST',
    body: { targetMemberId },
  });
}

export function listInvitations(organizationId: string, options?: { signal?: AbortSignal }) {
  return apiRequest<InvitationListResponse>(`${base(organizationId)}/invitations`, {
    signal: options?.signal,
  });
}

export function createInvitation(organizationId: string, input: CreateInvitationRequest) {
  return apiRequest<CreatedInvitationResponse>(`${base(organizationId)}/invitations`, {
    method: 'POST',
    body: input,
  });
}

export function revokeInvitation(organizationId: string, invitationId: string) {
  return apiRequest<void>(`${base(organizationId)}/invitations/${invitationId}`, {
    method: 'DELETE',
  });
}
