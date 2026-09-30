import type { AcceptInvitationResponse, PublicInvitationResponse } from '@app/shared';
import { apiRequest } from './http-client';

/** The token is a secret: it lives only in the URL path and the in-memory query cache. */
export const invitationKeys = {
  byToken: (token: string) => ['invitations', token] as const,
};

export function getInvitation(token: string, options?: { signal?: AbortSignal }) {
  return apiRequest<PublicInvitationResponse>(`/invitations/${encodeURIComponent(token)}`, {
    signal: options?.signal,
  });
}

export function acceptInvitation(token: string) {
  return apiRequest<AcceptInvitationResponse>(`/invitations/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
  });
}
