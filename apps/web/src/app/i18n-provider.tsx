import { type AuthUser, DEFAULT_LANGUAGE, type Language, LANGUAGE_LOCALES } from '@app/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { authQueryKeys } from '@/api/auth';
import { updatePreferences } from '@/api/preferences';
import { useAuth } from '@/hooks/use-auth';
import { readDeviceLanguage, storeDeviceLanguage } from '@/i18n/device-language';
import { I18nContext, type I18nContextValue } from '@/i18n/i18n-context';

/**
 * The single owner of the interface language (docs/localization.md):
 * - signed in: the user's saved language (`user.language` from GET /auth/me);
 *   until they choose one, the language of this device;
 * - signed out (sign-in pages): the language last used on this device
 *   (localStorage `app:language`), English by default — no authenticated call;
 * - switching is immediate (no reload, no remount: routes, workspaces, and
 *   unsaved form input stay) and is remembered on the device and, signed in,
 *   saved for the user (PATCH /me/preferences).
 * Language and appearance are independent.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [device, setDevice] = useState<Language>(() => readDeviceLanguage() ?? DEFAULT_LANGUAGE);
  const signedIn = auth.status === 'authenticated';
  const saved = signedIn ? auth.user.language : null;
  const language = saved ?? device;
  const { mutate: save } = useMutation({ mutationFn: updatePreferences });

  // The device follows the signed-in user's saved language (used again after sign-out):
  // adjusted while rendering, stored on the device afterwards.
  const [followed, setFollowed] = useState(saved);
  if (saved !== followed) {
    setFollowed(saved);
    if (saved) setDevice(saved);
  }
  useEffect(() => {
    if (saved) storeDeviceLanguage(saved);
  }, [saved]);

  useLayoutEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      locale: LANGUAGE_LOCALES[language],
      setLanguage: (next) => {
        storeDeviceLanguage(next);
        setDevice(next);
        if (!signedIn) return;
        // Immediately, without waiting for the server; the saved value follows.
        queryClient.setQueryData<AuthUser | null>(authQueryKeys.me, (user) =>
          user ? { ...user, language: next } : user,
        );
        save({ language: next });
      },
    }),
    [language, signedIn, queryClient, save],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
