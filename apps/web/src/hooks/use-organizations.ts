import type { MemberRole } from '@app/shared';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/http-client';
import {
  changeMemberRole,
  createInvitation,
  createOrganization,
  getOrganization,
  listInvitations,
  listMembers,
  listOrganizations,
  organizationKeys,
  removeMember,
  revokeInvitation,
  transferOwnership,
  updateOrganization,
} from '@/api/organizations';

/** The signed-in user's organizations (with their role in each). */
export function useOrganizations() {
  return useQuery({
    queryKey: organizationKeys.list(),
    queryFn: ({ signal }) => listOrganizations({ signal }),
  });
}

/** One organization plus the caller's membership. 404 = unknown OR not a member. */
export function useOrganization(organizationId: string) {
  return useQuery({
    queryKey: organizationKeys.detail(organizationId),
    queryFn: ({ signal }) => getOrganization(organizationId, { signal }),
    retry: false,
  });
}

export function useMembers(organizationId: string) {
  return useQuery({
    queryKey: organizationKeys.members(organizationId),
    queryFn: ({ signal }) => listMembers(organizationId, { signal }),
  });
}

export function useInvitations(organizationId: string, options: { enabled: boolean }) {
  return useQuery({
    queryKey: organizationKeys.invitations(organizationId),
    queryFn: ({ signal }) => listInvitations(organizationId, { signal }),
    enabled: options.enabled,
  });
}

/**
 * After a 403/404 from an organization endpoint the caller's membership or role
 * may have changed: refetch it so the UI reflects what the server now allows.
 */
function refreshAccessOnDenial(queryClient: QueryClient, organizationId: string, error: Error) {
  if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
    void queryClient.invalidateQueries({ queryKey: organizationKeys.detail(organizationId) });
  }
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createOrganization,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: organizationKeys.list() }),
  });
}

export function useUpdateOrganization(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => updateOrganization(organizationId, { name }),
    onSuccess: (data) => {
      queryClient.setQueryData(organizationKeys.detail(organizationId), data);
      void queryClient.invalidateQueries({ queryKey: organizationKeys.list() });
    },
    onError: (error) => refreshAccessOnDenial(queryClient, organizationId, error),
  });
}

export function useChangeMemberRole(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: MemberRole }) =>
      changeMemberRole(organizationId, memberId, role),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: organizationKeys.members(organizationId) }),
    onError: (error) => refreshAccessOnDenial(queryClient, organizationId, error),
  });
}

export function useRemoveMember(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => removeMember(organizationId, memberId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.members(organizationId) });
      void queryClient.invalidateQueries({ queryKey: organizationKeys.list() });
    },
    onError: (error) => refreshAccessOnDenial(queryClient, organizationId, error),
  });
}

export function useTransferOwnership(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (targetMemberId: string) => transferOwnership(organizationId, targetMemberId),
    // The caller's own role changed (OWNER → ADMIN): refresh everything about this organization.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.detail(organizationId) });
      void queryClient.invalidateQueries({ queryKey: organizationKeys.list() });
    },
    onError: (error) => refreshAccessOnDenial(queryClient, organizationId, error),
  });
}

export function useCreateInvitation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; role: MemberRole }) =>
      createInvitation(organizationId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: organizationKeys.invitations(organizationId) }),
    onError: (error) => refreshAccessOnDenial(queryClient, organizationId, error),
  });
}

export function useRevokeInvitation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) => revokeInvitation(organizationId, invitationId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: organizationKeys.invitations(organizationId) }),
    onError: (error) => refreshAccessOnDenial(queryClient, organizationId, error),
  });
}
