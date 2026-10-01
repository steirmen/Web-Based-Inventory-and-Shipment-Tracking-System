import {
  APPEARANCE_MODES,
  type AppearanceConfig,
  CUSTOM_TONES,
  DEFAULT_APPEARANCE,
  THEME_IDS,
} from '@app/shared';
import { describe, expect, it } from 'vitest';
import { contrast, fromHex, parseCss, toHex } from './color';
import { buildPalette, THEMES } from './themes';

const ratio = (palette: Record<string, string>, a: string, b: string) =>
  contrast(parseCss(palette[a]!), parseCss(palette[b]!));

/** WCAG targets every generated palette must meet: [token, background, minimum ratio]. */
const TARGETS: [string, string, number][] = [
  ['--foreground', '--surface', 7],
  ['--foreground', '--background', 7],
  ['--muted-foreground', '--surface', 4.5],
  ['--muted-foreground', '--surface-muted', 4.5],
  ['--muted-foreground', '--background', 4.5],
  ['--subtle-foreground', '--surface', 4.5],
  ['--subtle-foreground', '--background', 4.5],
  ['--primary-foreground', '--primary', 4.5],
  // The accent is also link and label text.
  ['--primary', '--surface', 4.5],
  ['--primary', '--background', 4.5],
  ['--success-soft-foreground', '--surface', 4.5],
  ['--ring', '--background', 3],
  ['--primary-soft-foreground', '--primary-soft', 4.5],
  ['--danger-foreground', '--danger', 4.5],
  ['--danger-soft-foreground', '--danger-soft', 4.5],
  ['--success-soft-foreground', '--success-soft', 4.5],
  ['--warning-soft-foreground', '--warning-soft', 4.5],
];
/** Dark mode only: error text sits directly on dark surfaces. */
const DARK_TARGETS: [string, string, number][] = [['--danger', '--surface', 4.5]];

/** Every target a palette misses, as readable labels (empty = accessible). */
function contrastFailures(config: AppearanceConfig): string[] {
  const palette = buildPalette(config);
  const targets = config.mode === 'dark' ? [...TARGETS, ...DARK_TARGETS] : TARGETS;
  return targets.flatMap(([token, background, min]) => {
    const value = ratio(palette, token, background);
    const label = `${config.theme}/${config.mode}/${config.customAccent}/${config.customTone}`;
    return value >= min
      ? []
      : [`${label}: ${token} on ${background} = ${value.toFixed(2)} < ${min}`];
  });
}

describe('color math', () => {
  it('round-trips hex through OKLCH', () => {
    for (const hex of ['#4f46e5', '#000000', '#ffffff', '#0ea5e9', '#ff00ff']) {
      expect(toHex(fromHex(hex))).toBe(hex);
    }
  });

  it('computes WCAG contrast', () => {
    expect(contrast(fromHex('#000000'), fromHex('#ffffff'))).toBeCloseTo(21, 0);
    expect(contrast(fromHex('#777777'), fromHex('#ffffff'))).toBeCloseTo(4.48, 1);
  });
});

describe('theme engine', () => {
  it('keeps the original Nexora tokens for Default in light mode', () => {
    const palette = buildPalette(DEFAULT_APPEARANCE);
    expect(palette['--primary']).toBe('oklch(51.1% 0.262 276.966)');
    expect(palette['--background']).toBe('oklch(98.4% 0.003 247.858)');
    expect(palette['--surface']).toBe('oklch(100% 0 0)');
  });

  it('defines a display name for every theme id, and nothing else', () => {
    expect(THEMES.map((theme) => theme.id)).toEqual([...THEME_IDS]);
  });

  it('builds the same complete token set for every theme and mode', () => {
    const keys = Object.keys(buildPalette(DEFAULT_APPEARANCE)).sort();
    for (const theme of THEME_IDS) {
      for (const mode of APPEARANCE_MODES) {
        expect(Object.keys(buildPalette({ ...DEFAULT_APPEARANCE, theme, mode })).sort()).toEqual(
          keys,
        );
      }
    }
  });

  it('meets contrast targets in every preset, in both modes', () => {
    const failures = THEME_IDS.flatMap((theme) =>
      APPEARANCE_MODES.flatMap((mode) => contrastFailures({ ...DEFAULT_APPEARANCE, theme, mode })),
    );
    expect(failures).toEqual([]);
  });

  it.each(['#ffffff', '#000000', '#ffff00', '#777777', '#00ffcc', '#ff0000', '#1a1a2e'])(
    'keeps a custom accent of %s readable in every tone and mode',
    (customAccent) => {
      const failures = CUSTOM_TONES.flatMap((customTone) =>
        APPEARANCE_MODES.flatMap((mode) =>
          contrastFailures({
            ...DEFAULT_APPEARANCE,
            theme: 'custom',
            customAccent,
            customTone,
            mode,
          }),
        ),
      );
      expect(failures).toEqual([]);
    },
  );

  it('keeps status colors identical across themes (statuses mean the same everywhere)', () => {
    for (const mode of APPEARANCE_MODES) {
      const a = buildPalette({ ...DEFAULT_APPEARANCE, theme: 'ocean', mode });
      const b = buildPalette({ ...DEFAULT_APPEARANCE, theme: 'rose', mode });
      expect(a['--danger-soft']).toBe(b['--danger-soft']);
      expect(a['--warning-soft-foreground']).toBe(b['--warning-soft-foreground']);
    }
  });
});
