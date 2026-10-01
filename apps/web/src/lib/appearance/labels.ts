import type {
  AnimationIntensity,
  AppearanceConfig,
  AppearanceMode,
  BackgroundEffect,
  CustomTone,
  Density,
  FontScale,
  Radius,
} from '@app/shared';
import { THEMES } from './themes';

/** Display names for the appearance identifiers (the identifiers are what gets saved). */

export const MODE_LABELS: Record<AppearanceMode, string> = {
  light: 'Light',
  dark: 'Dark',
};

export const EFFECTS: readonly { id: BackgroundEffect; name: string; description: string }[] = [
  { id: 'none', name: 'Off', description: 'A calm, plain background.' },
  { id: 'rain', name: 'Rain', description: 'Light, steady rainfall.' },
  { id: 'snow', name: 'Snow', description: 'Slowly drifting snowflakes.' },
  { id: 'fireflies', name: 'Fireflies', description: 'Softly glowing lights.' },
  { id: 'starry-night', name: 'Starry night', description: 'Twinkling stars.' },
  { id: 'autumn-leaves', name: 'Autumn leaves', description: 'Falling leaves in warm hues.' },
  { id: 'cherry-blossoms', name: 'Cherry blossoms', description: 'Drifting pink petals.' },
  { id: 'soft-lights', name: 'Soft lights', description: 'Large, slow color glows.' },
  { id: 'aurora', name: 'Aurora', description: 'Gentle northern lights.' },
];

export const INTENSITY_LABELS: Record<AnimationIntensity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const DENSITY_LABELS: Record<Density, string> = {
  compact: 'Compact',
  comfortable: 'Comfortable',
  spacious: 'Spacious',
};

export const RADIUS_LABELS: Record<Radius, string> = {
  sharp: 'Sharp',
  medium: 'Medium',
  round: 'Round',
};

export const FONT_SCALE_LABELS: Record<FontScale, string> = {
  small: 'Small',
  default: 'Default',
  large: 'Large',
};

export const TONE_LABELS: Record<CustomTone, string> = {
  neutral: 'Neutral',
  warm: 'Warm',
  cool: 'Cool',
};

export const themeName = (id: AppearanceConfig['theme']) =>
  THEMES.find((theme) => theme.id === id)?.name ?? id;
export const effectName = (id: BackgroundEffect) =>
  EFFECTS.find((effect) => effect.id === id)?.name ?? id;

/** "Dark · Ocean · Starry night" */
export function describeAppearance(config: AppearanceConfig): string {
  return [
    MODE_LABELS[config.mode],
    themeName(config.theme),
    config.backgroundEffect === 'none' ? null : effectName(config.backgroundEffect),
    DENSITY_LABELS[config.density],
  ]
    .filter(Boolean)
    .join(' · ');
}

export function sameAppearance(a: AppearanceConfig, b: AppearanceConfig): boolean {
  return (Object.keys(a) as (keyof AppearanceConfig)[]).every((key) => a[key] === b[key]);
}
