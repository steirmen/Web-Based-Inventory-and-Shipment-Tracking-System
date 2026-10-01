import { type AppearanceConfig, CUSTOM_TONES, HEX_COLOR_PATTERN } from '@app/shared';
import { Info } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { fromHex, parseCss, toHex, toRgb } from '@/lib/appearance/color';
import { TONE_LABELS } from '@/lib/appearance/labels';
import { buildPalette } from '@/lib/appearance/themes';

/**
 * The custom theme: one accent color and a tone. Everything else (surfaces,
 * borders, hover and focus colors, text on buttons) is derived by the theme
 * engine, which also keeps the result readable.
 */
export function CustomThemeEditor({
  config,
  onChange,
}: {
  config: AppearanceConfig;
  onChange: (patch: Partial<AppearanceConfig>) => void;
}) {
  // What the user is typing; only shown while it isn't a valid color yet,
  // otherwise the field shows the configured accent (which can also change
  // from outside, e.g. Cancel or applying a profile).
  const [typed, setTyped] = useState<string | null>(null);
  const hexError = typed === null ? undefined : 'Use a 6-digit hex color, e.g. #4f46e5.';
  const appliedColor = parseCss(buildPalette(config)['--primary']!);
  const applied = toHex(appliedColor);
  // Ignore rounding from the OKLCH round trip (a channel off by one or two).
  const requested = toRgb(fromHex(config.customAccent));
  const adjusted = toRgb(appliedColor).some(
    (channel, index) => Math.abs(channel - requested[index]!) > 2,
  );

  const commitHex = (value: string) => {
    const normalized = value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`;
    if (HEX_COLOR_PATTERN.test(normalized)) {
      setTyped(null);
      onChange({ customAccent: normalized.toLowerCase() });
    } else {
      setTyped(value);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-end">
        <FormField label="Accent color">
          {(control) => (
            <input
              {...control}
              type="color"
              value={config.customAccent}
              onChange={(event) => {
                setTyped(null);
                onChange({ customAccent: event.target.value.toLowerCase() });
              }}
              className="h-10 w-full cursor-pointer rounded-control border border-border-strong bg-surface p-1 focus-ring sm:w-20"
            />
          )}
        </FormField>
        <FormField label="Hex value" error={hexError} className="sm:max-w-48">
          {(control) => (
            <Input
              {...control}
              value={typed ?? config.customAccent}
              maxLength={7}
              spellCheck={false}
              autoComplete="off"
              className="font-mono uppercase"
              onChange={(event) => commitHex(event.target.value)}
            />
          )}
        </FormField>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Background tone</span>
        <SegmentedControl
          label="Background tone"
          value={config.customTone}
          options={CUSTOM_TONES.map((tone) => ({ value: tone, label: TONE_LABELS[tone] }))}
          onChange={(customTone) => onChange({ customTone })}
        />
      </div>

      <div className="flex flex-col gap-2 rounded-control border border-border bg-background p-4">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Preview
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" tabIndex={-1}>
            Primary action
          </Button>
          <Button size="sm" variant="secondary" tabIndex={-1}>
            Secondary
          </Button>
          <Badge tone="primary" dot>
            Selected
          </Badge>
          <Badge tone="success" dot>
            In stock
          </Badge>
        </div>
        {adjusted && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            In this mode we use {applied.toUpperCase()}, a close shade of your color, so buttons,
            links, and focus outlines stay readable.
          </p>
        )}
      </div>
    </div>
  );
}
