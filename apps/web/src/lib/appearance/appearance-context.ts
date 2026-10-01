import type { AppearanceConfig } from '@app/shared';
import { createContext, useContext } from 'react';

export interface AppearanceContextValue {
  /**
   * The persisted appearance (the defaults for guests and for users who never
   * saved one); null while the signed-in user's appearance is loading.
   */
  saved: AppearanceConfig | null;
  /** What is applied right now: an unsaved preview, or `saved`. */
  current: AppearanceConfig;
  status: 'guest' | 'loading' | 'ready' | 'error';
  error: unknown;
  retry: () => void;
  /**
   * Shows `config` immediately without saving it (Appearance page live
   * preview). `null` ends the preview and restores the saved appearance.
   */
  preview: (config: AppearanceConfig | null) => void;
  /** The OS/browser asks for reduced motion; decorative animation is then still. */
  reducedMotion: boolean;
}

export const AppearanceContext = createContext<AppearanceContextValue | null>(null);

/** The one source of appearance state in the app (provided by AppearanceProvider). */
export function useAppearance(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error('useAppearance() must be used inside <AppearanceProvider>.');
  return value;
}
