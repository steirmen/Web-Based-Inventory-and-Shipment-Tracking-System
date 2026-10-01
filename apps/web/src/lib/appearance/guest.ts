import {
  APPEARANCE_MODES,
  type AppearanceConfig,
  type AppearanceMode,
  GUEST_APPEARANCE,
  THEME_IDS,
  type ThemeId,
} from '@app/shared';

/**
 * The look a signed-out visitor chose on the sign-in pages (mode and theme
 * only), remembered on this device. Presentation only: no user, session, or
 * token data, never sent to the API, and never used once someone signs in —
 * a signed-in user always gets their saved appearance.
 */
export const GUEST_APPEARANCE_KEY = 'app:guest-appearance';

/** The custom theme needs the full Appearance page, so guests choose among the presets. */
export const GUEST_THEME_IDS: readonly ThemeId[] = THEME_IDS.filter((id) => id !== 'custom');

export type GuestAppearanceChange = Partial<Pick<AppearanceConfig, 'mode' | 'theme'>>;

const isMode = (value: unknown): value is AppearanceMode =>
  APPEARANCE_MODES.includes(value as AppearanceMode);
const isGuestTheme = (value: unknown): value is ThemeId =>
  GUEST_THEME_IDS.includes(value as ThemeId);

/** The guest appearance: GUEST_APPEARANCE plus this device's valid stored choice. */
export function readGuestAppearance(): AppearanceConfig {
  try {
    const stored = JSON.parse(localStorage.getItem(GUEST_APPEARANCE_KEY) ?? 'null') as {
      mode?: unknown;
      theme?: unknown;
    } | null;
    const mode = stored?.mode;
    const theme = stored?.theme;
    return {
      ...GUEST_APPEARANCE,
      ...(isMode(mode) && { mode }),
      ...(isGuestTheme(theme) && { theme }),
    };
  } catch {
    // Unavailable or corrupt storage: the default guest look.
    return GUEST_APPEARANCE;
  }
}

export function storeGuestAppearance({ mode, theme }: AppearanceConfig): void {
  try {
    localStorage.setItem(GUEST_APPEARANCE_KEY, JSON.stringify({ mode, theme }));
  } catch {
    // Optional: the choice then lasts until the page is reloaded.
  }
}
