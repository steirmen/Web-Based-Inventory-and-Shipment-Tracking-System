import type {
  AppearanceConfig,
  AppearanceProfileListResponse,
  AppearanceResponse,
  UpdateAppearanceProfileRequest,
} from '@app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  appearanceKeys,
  applyAppearanceProfile,
  createAppearanceProfile,
  deleteAppearanceProfile,
  getAppearance,
  listAppearanceProfiles,
  resetAppearance,
  saveAppearance,
  updateAppearanceProfile,
} from '@/api/appearance';
import { useAuth } from './use-auth';

/** The signed-in user's id (appearance queries are keyed by it). */
function useUserId(): string | null {
  const auth = useAuth();
  return auth.status === 'authenticated' ? auth.user.id : null;
}

/** The saved appearance of the signed-in user. Used by AppearanceProvider. */
export function useSavedAppearance() {
  const userId = useUserId();
  return useQuery({
    queryKey: appearanceKeys.current(userId ?? 'guest'),
    queryFn: ({ signal }) => getAppearance({ signal }),
    enabled: userId !== null,
    staleTime: Infinity,
  });
}

/** Every mutation that changes the current appearance answers with it: store it. */
function useStoreAppearance() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return (response: AppearanceResponse) => {
    if (userId) queryClient.setQueryData(appearanceKeys.current(userId), response);
  };
}

export function useSaveAppearance() {
  const store = useStoreAppearance();
  return useMutation({
    mutationFn: (config: AppearanceConfig) => saveAppearance(config),
    onSuccess: store,
  });
}

export function useResetAppearance() {
  const store = useStoreAppearance();
  return useMutation({ mutationFn: resetAppearance, onSuccess: store });
}

export function useAppearanceProfiles() {
  const userId = useUserId();
  return useQuery({
    queryKey: appearanceKeys.profiles(userId ?? 'guest'),
    queryFn: ({ signal }) => listAppearanceProfiles({ signal }),
    enabled: userId !== null,
  });
}

function useRefreshProfiles() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return () =>
    userId
      ? queryClient.invalidateQueries({ queryKey: appearanceKeys.profiles(userId) })
      : Promise.resolve();
}

export function useCreateAppearanceProfile() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: createAppearanceProfile,
    onSuccess: ({ profile }) => {
      if (!userId) return;
      queryClient.setQueryData<AppearanceProfileListResponse>(
        appearanceKeys.profiles(userId),
        (current) => ({ profiles: [...(current?.profiles ?? []), profile] }),
      );
    },
  });
}

export function useUpdateAppearanceProfile() {
  const refresh = useRefreshProfiles();
  return useMutation({
    mutationFn: ({
      profileId,
      body,
    }: {
      profileId: string;
      body: UpdateAppearanceProfileRequest;
    }) => updateAppearanceProfile(profileId, body),
    onSettled: refresh,
  });
}

export function useDeleteAppearanceProfile() {
  const refresh = useRefreshProfiles();
  return useMutation({ mutationFn: deleteAppearanceProfile, onSettled: refresh });
}

/** Makes a profile the current (saved) appearance. */
export function useApplyAppearanceProfile() {
  const store = useStoreAppearance();
  const refresh = useRefreshProfiles();
  return useMutation({
    mutationFn: applyAppearanceProfile,
    onSuccess: store,
    // A 404 means the profile is gone (e.g. deleted in another tab): reload the list.
    onError: refresh,
  });
}
