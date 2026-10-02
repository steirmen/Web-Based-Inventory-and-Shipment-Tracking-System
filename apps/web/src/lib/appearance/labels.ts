import type { AppearanceConfig, BackgroundEffect, Density, ThemeId } from '@app/shared';

/** The display names a summary line needs (from the dictionary; the ids are what gets saved). */
export interface AppearanceNames {
  modes: Record<AppearanceConfig['mode'], string>;
  themes: Record<ThemeId, string>;
  effects: Record<BackgroundEffect, string>;
  density: Record<Density, string>;
}

/** "Dark · Ocean · Starry night · Comfortable" */
export function describeAppearance(config: AppearanceConfig, names: AppearanceNames): string {
  return [
    names.modes[config.mode],
    names.themes[config.theme],
    config.backgroundEffect === 'none' ? null : names.effects[config.backgroundEffect],
    names.density[config.density],
  ]
    .filter(Boolean)
    .join(' · ');
}

export function sameAppearance(a: AppearanceConfig, b: AppearanceConfig): boolean {
  return (Object.keys(a) as (keyof AppearanceConfig)[]).every((key) => a[key] === b[key]);
}
