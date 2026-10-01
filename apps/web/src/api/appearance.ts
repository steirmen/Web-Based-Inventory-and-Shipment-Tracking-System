import type {
  AppearanceConfig,
  AppearanceProfileListResponse,
  AppearanceProfileResponse,
  AppearanceResponse,
  CreateAppearanceProfileRequest,
  UpdateAppearanceProfileRequest,
} from '@app/shared';
import { apiRequest } from './http-client';

/**
 * The signed-in user's appearance (user-level, not organization-scoped).
 * Keys include the user id, so one user's appearance can never answer a
 * query of another user in the same browser; sign-out also removes them.
 */
export const appearanceKeys = {
  all: (userId: string) => ['appearance', userId] as const,
  current: (userId: string) => [...appearanceKeys.all(userId), 'current'] as const,
  profiles: (userId: string) => [...appearanceKeys.all(userId), 'profiles'] as const,
};

const BASE = '/me/appearance';
const profilePath = (profileId: string) => `${BASE}/profiles/${encodeURIComponent(profileId)}`;

export function getAppearance(options?: { signal?: AbortSignal }) {
  return apiRequest<AppearanceResponse>(BASE, { signal: options?.signal });
}

export function saveAppearance(body: AppearanceConfig) {
  return apiRequest<AppearanceResponse>(BASE, { method: 'PUT', body });
}

export function resetAppearance() {
  return apiRequest<AppearanceResponse>(`${BASE}/reset`, { method: 'POST' });
}

export function listAppearanceProfiles(options?: { signal?: AbortSignal }) {
  return apiRequest<AppearanceProfileListResponse>(`${BASE}/profiles`, {
    signal: options?.signal,
  });
}

export function createAppearanceProfile(body: CreateAppearanceProfileRequest) {
  return apiRequest<AppearanceProfileResponse>(`${BASE}/profiles`, { method: 'POST', body });
}

export function updateAppearanceProfile(profileId: string, body: UpdateAppearanceProfileRequest) {
  return apiRequest<AppearanceProfileResponse>(profilePath(profileId), { method: 'PATCH', body });
}

export function deleteAppearanceProfile(profileId: string) {
  return apiRequest<void>(profilePath(profileId), { method: 'DELETE' });
}

export function applyAppearanceProfile(profileId: string) {
  return apiRequest<AppearanceResponse>(`${profilePath(profileId)}/apply`, { method: 'POST' });
}
