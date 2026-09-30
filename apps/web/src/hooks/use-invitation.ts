import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { acceptInvitation, getInvitation, invitationKeys } from '@/api/invitations';
import { organizationKeys } from '@/api/organizations';

export function useInvitation(token: string) {
  return useQuery({
    queryKey: invitationKeys.byToken(token),
    queryFn: ({ signal }) => getInvitation(token, { signal }),
    retry: false,
    staleTime: 0,
  });
}

export function useAcceptInvitation(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => acceptInvitation(token),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: invitationKeys.byToken(token) });
      void queryClient.invalidateQueries({ queryKey: organizationKeys.list() });
    },
  });
}
