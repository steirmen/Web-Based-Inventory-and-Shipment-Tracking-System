import type { AppearanceConfig, AppearanceMode, CustomTone, ThemeId } from '@app/shared';
import {
  contrast,
  css,
  ensureContrast,
  fromHex,
  INK,
  type Oklch,
  oklch,
  parseCss,
  WHITE,
  withLightness,
} from './color';

/**
 * The theme engine: every preset (and the custom theme) is described by a
 * few parameters — a neutral tint and an accent per mode — and expanded into
 * the complete set of semantic tokens the design system uses
 * (src/styles/globals.css). Components never know which theme is active.
 *
 * Accessibility is enforced here, not left to each theme: text tokens are
 * pushed to WCAG AA contrast against their surfaces, the primary color is
 * kept distinguishable from surfaces (3:1), and the text on primary buttons
 * is chosen (and the accent adjusted if needed) for 4.5:1.
 */

/** Every CSS custom property the engine sets. */
export type Palette = Record<`--${string}`, string>;

interface ThemeSpec {
  /** Tint of backgrounds, surfaces, borders, and neutral text. */
  neutral: { hue: number; chroma: number };
  accent: Record<AppearanceMode, Oklch>;
  /** Paper-like: surfaces are warm off-white instead of pure white. */
  warmSurface?: boolean;
}

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  description: string;
}

/** Display names (never persisted — the ids are). */
export const THEMES: readonly ThemeInfo[] = [
  { id: 'default', name: 'Default', description: 'The classic Nexora indigo.' },
  { id: 'ocean', name: 'Ocean', description: 'Calm blues and cool grays.' },
  { id: 'forest', name: 'Forest', description: 'Deep greens, grounded neutrals.' },
  { id: 'sunset', name: 'Sunset', description: 'Warm orange accents.' },
  { id: 'graphite', name: 'Graphite', description: 'Monochrome and focused.' },
  { id: 'plum', name: 'Plum', description: 'Rich purple-magenta.' },
  { id: 'paper', name: 'Paper', description: 'Soft cream, ink-like accents.' },
  { id: 'mint', name: 'Mint', description: 'Fresh teal greens.' },
  { id: 'lavender', name: 'Lavender', description: 'Gentle violet tones.' },
  { id: 'rose', name: 'Rose', description: 'Warm pinks and reds.' },
  { id: 'custom', name: 'Custom', description: 'Your accent color and tone.' },
];

const PRESETS: Record<Exclude<ThemeId, 'custom'>, ThemeSpec> = {
  default: {
    neutral: { hue: 257, chroma: 0.009 },
    accent: { light: oklch(0.511, 0.262, 276.966), dark: oklch(0.673, 0.182, 276.935) },
  },
  ocean: {
    neutral: { hue: 230, chroma: 0.012 },
    accent: { light: oklch(0.52, 0.14, 237), dark: oklch(0.72, 0.13, 232) },
  },
  forest: {
    neutral: { hue: 150, chroma: 0.01 },
    accent: { light: oklch(0.5, 0.13, 152), dark: oklch(0.73, 0.15, 155) },
  },
  sunset: {
    neutral: { hue: 50, chroma: 0.012 },
    accent: { light: oklch(0.58, 0.19, 40), dark: oklch(0.73, 0.16, 50) },
  },
  graphite: {
    neutral: { hue: 260, chroma: 0.004 },
    accent: { light: oklch(0.32, 0.02, 260), dark: oklch(0.86, 0.01, 260) },
  },
  plum: {
    neutral: { hue: 330, chroma: 0.012 },
    accent: { light: oklch(0.48, 0.17, 335), dark: oklch(0.73, 0.15, 330) },
  },
  paper: {
    neutral: { hue: 75, chroma: 0.02 },
    accent: { light: oklch(0.45, 0.09, 55), dark: oklch(0.8, 0.09, 75) },
    warmSurface: true,
  },
  mint: {
    neutral: { hue: 175, chroma: 0.012 },
    accent: { light: oklch(0.55, 0.11, 175), dark: oklch(0.79, 0.12, 172) },
  },
  lavender: {
    neutral: { hue: 295, chroma: 0.014 },
    accent: { light: oklch(0.55, 0.17, 292), dark: oklch(0.76, 0.13, 292) },
  },
  rose: {
    neutral: { hue: 10, chroma: 0.012 },
    accent: { light: oklch(0.57, 0.2, 12), dark: oklch(0.74, 0.15, 12) },
  },
};

const CUSTOM_TONES: Record<CustomTone, (accentHue: number) => ThemeSpec['neutral']> = {
  // Barely tinted toward the accent.
  neutral: (hue) => ({ hue, chroma: 0.006 }),
  warm: () => ({ hue: 70, chroma: 0.016 }),
  cool: () => ({ hue: 245, chroma: 0.016 }),
};

/** The custom theme: the chosen accent, made usable in both modes. */
function customSpec(accentHex: string, tone: CustomTone): ThemeSpec {
  const accent = fromHex(accentHex);
  return {
    neutral: CUSTOM_TONES[tone](accent.h),
    accent: {
      // Same hue and chroma; lightness is corrected for each mode below if needed.
      light: accent,
      dark: withLightness(accent, Math.max(accent.l, 0.68)),
    },
  };
}

/** The Nexora look before themes existed (light mode of Default), unchanged. */
const DEFAULT_LIGHT: Palette = {
  '--background': 'oklch(98.4% 0.003 247.858)',
  '--surface': 'oklch(100% 0 0)',
  '--surface-muted': 'oklch(96.8% 0.007 247.896)',
  '--foreground': 'oklch(20.8% 0.042 265.755)',
  '--muted-foreground': 'oklch(44.6% 0.043 257.281)',
  '--subtle-foreground': 'oklch(55.4% 0.046 257.417)',
  '--border': 'oklch(92.9% 0.013 255.508)',
  '--border-strong': 'oklch(86.9% 0.022 252.894)',
  '--primary': 'oklch(51.1% 0.262 276.966)',
  '--primary-hover': 'oklch(45.7% 0.24 277.023)',
  '--primary-foreground': 'oklch(100% 0 0)',
  '--primary-soft': 'oklch(96.2% 0.018 272.314)',
  '--primary-soft-foreground': 'oklch(45.7% 0.24 277.023)',
  '--ring': 'oklch(58.5% 0.233 277.117)',
  '--overlay': 'oklch(20.8% 0.042 265.755 / 0.4)',
};

// Status colors do not follow the theme: success, warning, and danger must
// mean the same thing (and stay distinguishable) in every theme.
const STATUS: Record<AppearanceMode, Record<string, Oklch>> = {
  light: {
    '--success': oklch(0.596, 0.145, 163.225),
    '--success-soft': oklch(0.979, 0.021, 166.113),
    '--success-soft-foreground': oklch(0.432, 0.095, 166.913),
    '--success-border': oklch(0.905, 0.093, 164.15),
    '--warning': oklch(0.769, 0.188, 70.08),
    '--warning-soft': oklch(0.987, 0.022, 95.277),
    '--warning-soft-foreground': oklch(0.473, 0.137, 46.201),
    '--warning-border': oklch(0.924, 0.12, 95.746),
    '--danger': oklch(0.577, 0.245, 27.325),
    '--danger-hover': oklch(0.505, 0.213, 27.518),
    '--danger-foreground': WHITE,
    '--danger-soft': oklch(0.971, 0.013, 17.38),
    '--danger-soft-foreground': oklch(0.444, 0.177, 26.899),
    '--danger-border': oklch(0.885, 0.062, 18.334),
  },
  dark: {
    '--success': oklch(0.72, 0.15, 162),
    '--success-soft': oklch(0.29, 0.05, 165),
    '--success-soft-foreground': oklch(0.86, 0.11, 163),
    '--success-border': oklch(0.42, 0.08, 164),
    '--warning': oklch(0.8, 0.16, 75),
    '--warning-soft': oklch(0.3, 0.05, 75),
    '--warning-soft-foreground': oklch(0.89, 0.12, 85),
    '--warning-border': oklch(0.45, 0.09, 75),
    '--danger': oklch(0.56, 0.2, 25),
    '--danger-hover': oklch(0.5, 0.19, 25),
    '--danger-foreground': WHITE,
    '--danger-soft': oklch(0.29, 0.07, 22),
    '--danger-soft-foreground': oklch(0.85, 0.09, 20),
    '--danger-border': oklch(0.44, 0.12, 22),
  },
};

const SHADOWS: Record<AppearanceMode, Palette> = {
  light: {
    '--shadow-card': '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.04)',
    '--shadow-raised': '0 4px 12px -2px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.05)',
  },
  dark: {
    '--shadow-card': '0 1px 2px 0 rgb(0 0 0 / 0.3), 0 1px 3px 0 rgb(0 0 0 / 0.2)',
    '--shadow-raised': '0 8px 20px -4px rgb(0 0 0 / 0.5), 0 2px 6px -2px rgb(0 0 0 / 0.35)',
  },
};

/**
 * Contrast targets are met with a small margin: tokens are written as rounded
 * CSS values, and rounding must never push a pair below its minimum.
 */
const MARGIN = 0.05;

/** The text color for a primary button, adjusting the accent if neither white nor ink is readable. */
function primaryPair(accent: Oklch): { primary: Oklch; on: Oklch } {
  const on = contrast(WHITE, accent) >= contrast(INK, accent) ? WHITE : INK;
  // Darken under white text, lighten under ink, until 4.5:1.
  return { primary: ensureContrast(accent, on, 4.5 + MARGIN), on };
}

/** Expands a theme spec into every semantic token for one mode. */
function expand(spec: ThemeSpec, mode: AppearanceMode): Palette {
  const { hue, chroma } = spec.neutral;
  const n = (l: number, c: number) => oklch(l, c, hue);
  const light = mode === 'light';

  const background = light ? n(0.984, chroma * 0.4) : n(0.17, chroma * 1.4 + 0.004);
  const surface = light
    ? spec.warmSurface
      ? n(0.993, 0.012)
      : n(1, 0)
    : n(0.21, chroma * 1.4 + 0.006);
  const surfaceMuted = light ? n(0.968, chroma * 0.9) : n(0.255, chroma * 1.4 + 0.007);
  // Text tokens are guaranteed readable on every surface they appear on.
  const readable = (color: Oklch, min: number) =>
    ensureContrast(ensureContrast(color, surfaceMuted, min + MARGIN), background, min + MARGIN);
  const text = (l: number, c: number, min: number) => readable(n(l, c), min);
  const foreground = text(light ? 0.208 : 0.965, light ? chroma * 4.5 : chroma, 7);
  const muted = text(light ? 0.446 : 0.78, chroma * (light ? 4.6 : 1.5), 4.5);
  // Subtle text (meta, footer, placeholders) is still real text: 4.5:1, like Default.
  const subtle = text(light ? 0.554 : 0.66, chroma * (light ? 4.8 : 1.6), 4.5);

  const { primary, on } = primaryPair(
    // The accent is also text (links, eyebrows, selected labels) on every surface.
    ensureContrast(readable(spec.accent[mode], 4.5), surface, 4.5 + MARGIN),
  );
  const hover = withLightness(primary, primary.l + (light ? -0.054 : 0.05));
  const soft = light
    ? oklch(0.962, Math.min(0.03, primary.c * 0.12), primary.h)
    : oklch(0.3, Math.min(0.08, primary.c * 0.4), primary.h);
  const softForeground = ensureContrast(
    light
      ? withLightness(primary, Math.min(primary.l, 0.46))
      : oklch(0.86, primary.c * 0.6, primary.h),
    soft,
    4.5,
  );
  const ring = ensureContrast(
    withLightness(primary, primary.l + (light ? 0.074 : 0.06)),
    background,
    3,
  );

  const palette: Palette = {
    '--background': css(background),
    '--surface': css(surface),
    '--surface-muted': css(surfaceMuted),
    '--foreground': css(foreground),
    '--muted-foreground': css(muted),
    '--subtle-foreground': css(subtle),
    '--border': css(light ? n(0.929, chroma * 1.5) : n(0.31, chroma * 1.4 + 0.008)),
    '--border-strong': css(light ? n(0.869, chroma * 2.5) : n(0.39, chroma * 1.4 + 0.01)),
    '--primary': css(primary),
    '--primary-hover': css(hover),
    '--primary-foreground': css(on),
    '--primary-soft': css(soft),
    '--primary-soft-foreground': css(softForeground),
    '--ring': css(ring),
    '--overlay': light ? css(n(0.208, chroma * 4.5), 0.4) : css(oklch(0.08, 0, 0), 0.6),
  };
  return palette;
}

/**
 * Status tokens for a mode. Light mode keeps the original values in every
 * theme; in dark mode the colors also used as text (`text-success`,
 * `text-danger`) are checked against the theme's surface.
 */
function status(mode: AppearanceMode, surface: Oklch): Palette {
  const palette: Palette = {};
  for (const [name, value] of Object.entries(STATUS[mode])) {
    const isText = mode === 'dark' && /^--(success|danger)$/.test(name);
    palette[name as `--${string}`] = css(isText ? ensureContrast(value, surface, 4.5) : value);
  }
  if (mode === 'dark') {
    // `--danger` is both error text and the solid danger button. Lightened for
    // text above, the button then reads best with dark text (same rule as primary).
    const { primary: danger, on } = primaryPair(parseCss(palette['--danger']!));
    palette['--danger'] = css(danger);
    palette['--danger-foreground'] = css(on);
    palette['--danger-hover'] = css(withLightness(danger, danger.l + 0.05));
  }
  return palette;
}

/** The complete token set for an appearance (theme + mode, including status and shadows). */
export function buildPalette(config: AppearanceConfig): Palette {
  const { mode } = config;
  if (config.theme === 'default' && mode === 'light') {
    // Unchanged from before personalization (status tokens are the original values too).
    return {
      ...DEFAULT_LIGHT,
      ...Object.fromEntries(Object.entries(STATUS.light).map(([key, value]) => [key, css(value)])),
      ...SHADOWS.light,
    };
  }
  const spec =
    config.theme === 'custom'
      ? customSpec(config.customAccent, config.customTone)
      : PRESETS[config.theme];
  const palette = expand(spec, mode);
  return { ...palette, ...status(mode, parseCss(palette['--surface']!)), ...SHADOWS[mode] };
}

/** The four colors a theme card shows. */
export function themePreview(
  theme: ThemeId,
  config: AppearanceConfig,
): { background: string; surface: string; text: string; accent: string } {
  const palette = buildPalette({ ...config, theme });
  return {
    background: palette['--background']!,
    surface: palette['--surface']!,
    text: palette['--foreground']!,
    accent: palette['--primary']!,
  };
}
