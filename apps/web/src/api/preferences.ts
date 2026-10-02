import type { PreferencesResponse, UpdatePreferencesRequest } from '@app/shared';
import { apiRequest } from './http-client';

/** `PATCH /me/preferences`: the signed-in user's own interface language. */
export function updatePreferences(input: UpdatePreferencesRequest): Promise<PreferencesResponse> {
  return apiRequest<PreferencesResponse>('/me/preferences', { method: 'PATCH', body: input });
}
