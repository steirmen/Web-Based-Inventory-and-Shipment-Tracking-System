import type { AuthUser } from '@app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { authQueryKeys, getCurrentUser, login, logout, register } from '@/api/auth';
import { paths } from '@/routes/paths';

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'unauthenticated'; user: null }
  /** The session check itself failed (API unreachable or 5xx) — neither signed in nor out. */
  | { status: 'error'; user: null; error: Error; retry: () => void };

/**
 * Authentication state, derived from `GET /auth/me` via TanStack Query.
 * The server (HttpOnly session cookie) is the only source of truth; nothing
 * about the session is stored in the browser.
 */
export function useAuth(): AuthState {
  const { data, error, refetch } = useQuery({
    queryKey: authQueryKeys.me,
    queryFn: ({ signal }) => getCurrentUser({ signal }),
    staleTime: 5 * 60_000,
  });

  if (data) {
    return { status: 'authenticated', user: data };
  }
  if (data === null) {
    return { status: 'unauthenticated', user: null };
  }
  if (error) {
    return { status: 'error', user: null, error, retry: () => void refetch() };
  }
  return { status: 'loading', user: null };
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: login,
    // Guest routes react to this and redirect into the app.
    onSuccess: (user) => queryClient.setQueryData(authQueryKeys.me, user),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: register,
    onSuccess: (user) => queryClient.setQueryData(authQueryKeys.me, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    /**
     * `returnTo`: an internal path to come back to after the next sign-in (e.g. an invite link);
     * `email`: prefilled on the sign-in form.
     */
    mutationFn: (_options?: { returnTo?: string; email?: string }) => logout(),
    onSuccess: async (_data, options) => {
      // Drop every cached server response that belonged to the signed-in user.
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== authQueryKeys.me[0],
      });
      queryClient.setQueryData(authQueryKeys.me, null);
      await navigate(paths.login, {
        replace: true,
        state: options?.returnTo ? { from: options.returnTo, email: options.email } : undefined,
      });
    },
  });
}
