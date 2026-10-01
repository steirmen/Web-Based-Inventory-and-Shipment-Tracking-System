/**
 * Small, dependency-free color math for the theme engine: OKLCH ⇄ sRGB
 * (Björn Ottosson's OKLab), WCAG relative luminance and contrast, and
 * helpers that move a color's lightness until a contrast target is met.
 * Palettes are defined in OKLCH because equal lightness steps look equal
 * across hues, which keeps every theme's structure consistent.
 */

export interface Oklch {
  /** Lightness, 0…1. */
  l: number;
  /** Chroma, ≥ 0 (≈ 0…0.37 in sRGB). */
  c: number;
  /** Hue in degrees. */
  h: number;
}

export type Rgb = [r: number, g: number, b: number];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
const fromLinear = (channel: number) =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;

export function oklch(l: number, c: number, h: number): Oklch {
  return { l, c, h };
}

/** OKLCH → linear sRGB (unclamped). */
function toLinearRgb({ l, c, h }: Oklch): Rgb {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

/** OKLCH → sRGB channels 0…255 (clipped to the sRGB gamut). */
export function toRgb(color: Oklch): Rgb {
  return toLinearRgb(color).map((channel) => Math.round(fromLinear(clamp01(channel)) * 255)) as Rgb;
}

export function toHex(color: Oklch): string {
  return `#${toRgb(color)
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** `#rrggbb` → OKLCH. */
export function fromHex(hex: string): Oklch {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((index) =>
    toLinear(parseInt(value.slice(index, index + 2), 16) / 255),
  ) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.sqrt(A * A + B * B);
  const h = c < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

/** CSS `oklch()` string, optionally with alpha. */
export function css(color: Oklch, alpha?: number): string {
  const l = `${+(color.l * 100).toFixed(1)}%`;
  const c = +color.c.toFixed(3);
  const h = +color.h.toFixed(1);
  return alpha === undefined ? `oklch(${l} ${c} ${h})` : `oklch(${l} ${c} ${h} / ${alpha})`;
}

/** WCAG relative luminance of the (gamut-clipped) color. */
export function luminance(color: Oklch): number {
  const [r, g, b] = toLinearRgb(color).map(clamp01) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1…21. */
export function contrast(a: Oklch, b: Oklch): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

export const withLightness = (color: Oklch, l: number): Oklch => ({ ...color, l: clamp01(l) });

/**
 * Moves `color`'s lightness away from `against` (darker on light
 * backgrounds, lighter on dark ones) until the contrast reaches `min`.
 * Hue and chroma are kept, so the color keeps its character.
 */
export function ensureContrast(color: Oklch, against: Oklch, min: number): Oklch {
  if (contrast(color, against) >= min) return color;
  const direction = luminance(against) > 0.18 ? -1 : 1;
  let candidate = color;
  for (let step = 0; step < 100 && contrast(candidate, against) < min; step++) {
    const next = withLightness(candidate, candidate.l + direction * 0.01);
    if (next.l === candidate.l) break;
    candidate = next;
  }
  return candidate;
}

export const WHITE = oklch(1, 0, 0);
/** Near-black text used on light accents. */
export const INK = oklch(0.2, 0.02, 265);

/** Parses the `oklch(L% C H)` strings produced by `css()` (alpha is ignored). */
export function parseCss(value: string): Oklch {
  const match = /^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)/.exec(value);
  if (!match) throw new Error(`Not an oklch() color: ${value}`);
  return oklch(Number(match[1]) / 100, Number(match[2]), Number(match[3]));
}
