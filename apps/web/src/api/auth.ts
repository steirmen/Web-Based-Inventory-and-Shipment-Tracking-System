import type { AuthUser, AuthUserResponse, LoginRequest, RegisterRequest } from '@app/shared';
import { ApiError, apiRequest } from './http-client';

export const authQueryKeys = {
  /** The signed-in user: `AuthUser`, or `null` when there is no valid session. */
  me: ['auth', 'me'] as const,
};

/** `GET /auth/me`. Resolves to `null` (not an error) when the visitor is not signed in. */
export async function getCurrentUser(options?: { signal?: AbortSignal }): Promise<AuthUser | null> {
  try {
    const { user } = await apiRequest<AuthUserResponse>('/auth/me', { signal: options?.signal });
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export async function login(input: LoginRequest): Promise<AuthUser> {
  const { user } = await apiRequest<AuthUserResponse>('/auth/login', {
    method: 'POST',
    body: input,
  });
  return user;
}

export async function register(input: RegisterRequest): Promise<AuthUser> {
  const { user } = await apiRequest<AuthUserResponse>('/auth/register', {
    method: 'POST',
    body: input,
  });
  return user;
}

export function logout(): Promise<void> {
  return apiRequest<void>('/auth/logout', { method: 'POST' });
}
