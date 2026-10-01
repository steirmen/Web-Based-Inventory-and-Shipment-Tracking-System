import type { AppearanceConfig } from '@app/shared';
import { parseCss, toHex } from './color';
import { buildPalette } from './themes';

/**
 * Applies an appearance to the document: semantic color tokens as CSS custom
 * properties on <html>, plus data attributes that the CSS in globals.css maps
 * to density, radius, and text scale. This is the ONLY place that touches
 * the document's look; components only consume the tokens.
 */

/**
 * localStorage key of the startup cache: the computed CSS variables and data
 * attributes of the last applied appearance (the signed-in user's saved one,
 * or the guest appearance). Read by the tiny script in index.html before React
 * starts, so a reload doesn't flash another theme. Presentation only — never
 * authentication data. The server stays the source of truth; signing out
 * replaces the cache with the guest appearance.
 */
export const APPEARANCE_CACHE_KEY = 'app:appearance';

interface CachedAppearance {
  vars: Record<string, string>;
  data: Record<string, string>;
}

function attributesOf(config: AppearanceConfig): Record<string, string> {
  return {
    mode: config.mode,
    theme: config.theme,
    density: config.density,
    radius: config.radius,
    fontScale: config.fontScale,
  };
}

export function applyAppearance(config: AppearanceConfig, root = document.documentElement): void {
  const palette = buildPalette(config);
  for (const [name, value] of Object.entries(palette)) root.style.setProperty(name, value);
  Object.assign(root.dataset, attributesOf(config));

  // Browser UI (mobile address bar) follows the canvas color.
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', toHex(parseCss(palette['--background']!)));
}

export function cacheAppearance(config: AppearanceConfig): void {
  const cached: CachedAppearance = { vars: buildPalette(config), data: attributesOf(config) };
  try {
    localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Storage may be unavailable (private mode, quota): the cache is optional.
  }
}
