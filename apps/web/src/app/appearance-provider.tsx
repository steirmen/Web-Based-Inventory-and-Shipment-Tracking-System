import { type AppearanceConfig, DEFAULT_APPEARANCE } from '@app/shared';
import { type ReactNode, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { BackgroundEffectLayer } from '@/components/appearance/background-effect-layer';
import { useAuth } from '@/hooks/use-auth';
import { useSavedAppearance } from '@/hooks/use-appearance';
import { applyAppearance, cacheAppearance } from '@/lib/appearance/apply';
import {
  AppearanceContext,
  type AppearanceContextValue,
} from '@/lib/appearance/appearance-context';
import {
  type GuestAppearanceChange,
  readGuestAppearance,
  storeGuestAppearance,
} from '@/lib/appearance/guest';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
const readReducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches;

/**
 * The single owner of appearance state:
 * - guests (sign-in pages) see the guest appearance (dark by default; the
 *   choice made there is kept on this device), which also replaces the startup
 *   cache, so signing out never leaves the previous user's look behind;
 * - signed in, the user's saved appearance (GET /me/appearance) is applied
 *   and cached for the next startup (index.html);
 * - the Appearance page can preview an unsaved configuration, which is
 *   applied immediately and dropped again by `preview(null)`.
 * It also renders the ONE background effect layer of the app.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const saved = useSavedAppearance();
  const [preview, setPreview] = useState<AppearanceConfig | null>(null);
  const [guestConfig, setGuestConfig] = useState(readGuestAppearance);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, readReducedMotion);

  const guest = auth.status === 'unauthenticated';
  const savedConfig = guest ? guestConfig : (saved.data?.appearance ?? null);
  // Guests never see a preview. While the user's appearance loads, `current`
  // is null and what index.html applied from the cache stays in place.
  const current = guest ? guestConfig : (preview ?? savedConfig);

  useLayoutEffect(() => {
    if (current) applyAppearance(current);
  }, [current]);

  useLayoutEffect(() => {
    if (guest) {
      cacheAppearance(guestConfig);
    } else if (saved.data) {
      cacheAppearance(saved.data.appearance);
    }
  }, [guest, guestConfig, saved.data]);

  const value = useMemo<AppearanceContextValue>(
    () => ({
      saved: savedConfig,
      current: current ?? DEFAULT_APPEARANCE,
      status: guest ? 'guest' : saved.isError ? 'error' : saved.data ? 'ready' : 'loading',
      error: saved.error,
      retry: () => void saved.refetch(),
      preview: setPreview,
      changeGuestAppearance: (change: GuestAppearanceChange) => {
        const next = { ...guestConfig, ...change };
        storeGuestAppearance(next);
        setGuestConfig(next);
      },
      reducedMotion,
    }),
    [savedConfig, current, guest, guestConfig, saved, reducedMotion],
  );

  return (
    <AppearanceContext.Provider value={value}>
      <BackgroundEffectLayer />
      {children}
    </AppearanceContext.Provider>
  );
}
