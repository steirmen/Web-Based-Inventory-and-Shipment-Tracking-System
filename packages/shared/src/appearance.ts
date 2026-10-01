/**
 * Personalization & appearance API contract (Phase 7B).
 *
 * Appearance is a USER-level, presentation-only preference: it changes how
 * Nexora looks (colors, effects, density, corner radius, text size), never
 * its structure, navigation, or workflow. It is the same in every
 * organization the user belongs to.
 *
 * Every value below is a stable identifier: persisted in the database,
 * validated by the API, and never a localized display name. Display names
 * live in the web app.
 */

export const APPEARANCE_MODES = ['light', 'dark'] as const;
export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

/** Preset themes plus `custom` (accent + tone chosen by the user). */
export const THEME_IDS = [
  'default',
  'ocean',
  'forest',
  'sunset',
  'graphite',
  'plum',
  'paper',
  'mint',
  'lavender',
  'rose',
  'custom',
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** Neutral tint of the custom theme's backgrounds, surfaces, and borders. */
export const CUSTOM_TONES = ['neutral', 'warm', 'cool'] as const;
export type CustomTone = (typeof CUSTOM_TONES)[number];

/** Decorative effects drawn behind the application. Never interactive. */
export const BACKGROUND_EFFECTS = [
  'none',
  'rain',
  'snow',
  'fireflies',
  'starry-night',
  'autumn-leaves',
  'cherry-blossoms',
  'soft-lights',
  'aurora',
] as const;
export type BackgroundEffect = (typeof BACKGROUND_EFFECTS)[number];

/** How much the background effect moves. `prefers-reduced-motion` always wins. */
export const ANIMATION_INTENSITIES = ['low', 'medium', 'high'] as const;
export type AnimationIntensity = (typeof ANIMATION_INTENSITIES)[number];

/** Spacing scale of the interface (padding, gaps, control heights). */
export const DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
export type Density = (typeof DENSITIES)[number];

export const RADII = ['sharp', 'medium', 'round'] as const;
export type Radius = (typeof RADII)[number];

/** Overall text and UI scale. */
export const FONT_SCALES = ['small', 'default', 'large'] as const;
export type FontScale = (typeof FONT_SCALES)[number];

/** `#rrggbb` — the only color format accepted (stored lower-case). */
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** The complete, flat appearance configuration. */
export interface AppearanceConfig {
  mode: AppearanceMode;
  theme: ThemeId;
  /** Accent of the custom theme (`#rrggbb`); kept when another theme is selected. */
  customAccent: string;
  customTone: CustomTone;
  backgroundEffect: BackgroundEffect;
  animationIntensity: AnimationIntensity;
  density: Density;
  radius: Radius;
  fontScale: FontScale;
}

/** The Nexora look before personalization existed: what "Reset to default" restores. */
export const DEFAULT_APPEARANCE: AppearanceConfig = {
  mode: 'light',
  theme: 'default',
  customAccent: '#4f46e5',
  customTone: 'neutral',
  backgroundEffect: 'none',
  animationIntensity: 'medium',
  density: 'comfortable',
  radius: 'medium',
  fontScale: 'default',
};

export const APPEARANCE_FIELDS = [
  'mode',
  'theme',
  'customAccent',
  'customTone',
  'backgroundEffect',
  'animationIntensity',
  'density',
  'radius',
  'fontScale',
] as const satisfies readonly (keyof AppearanceConfig)[];

export const APPEARANCE_LIMITS = {
  profileNameMaxLength: 60,
  /** Saved profiles per user. */
  profilesMax: 12,
} as const;

export interface AppearanceResponse {
  appearance: AppearanceConfig;
  /** null while the user still uses the defaults (nothing saved yet). */
  updatedAt: string | null;
}

/** A named, saved appearance. Presentation preferences only — no business data. */
export interface AppearanceProfile {
  id: string;
  name: string;
  appearance: AppearanceConfig;
  createdAt: string;
  updatedAt: string;
}

export interface AppearanceProfileListResponse {
  profiles: AppearanceProfile[];
}

export interface AppearanceProfileResponse {
  profile: AppearanceProfile;
}

export interface CreateAppearanceProfileRequest {
  name: string;
  appearance: AppearanceConfig;
}

export interface UpdateAppearanceProfileRequest {
  name?: string;
  appearance?: AppearanceConfig;
}
