import { type AppearanceConfig, THEME_IDS, type ThemeId } from '@app/shared';
import { Check, Palette } from 'lucide-react';
import { radioOptionProps } from '@/components/ui/use-radio-group';
import { cn } from '@/lib/cn';
import { THEMES, themePreview } from '@/lib/appearance/themes';

/**
 * Theme cards: each one is a miniature of the real interface in that theme
 * (canvas, a card, text lines, and the accent) for the current mode. The
 * selected card has a check mark and a thicker outline, not just a color.
 */
export function ThemePicker({
  config,
  onChange,
}: {
  config: AppearanceConfig;
  onChange: (theme: ThemeId) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
    >
      {THEMES.map((theme) => {
        const colors = themePreview(theme.id, config);
        const checked = config.theme === theme.id;
        return (
          <button
            key={theme.id}
            {...radioOptionProps(THEME_IDS, config.theme, onChange, theme.id)}
            aria-label={`${theme.name} theme`}
            className={cn(
              'group relative flex flex-col overflow-hidden rounded-card border text-left focus-ring transition',
              checked
                ? 'border-primary ring-2 ring-primary'
                : 'border-border hover:border-border-strong',
            )}
          >
            <span
              className="relative flex h-20 items-end gap-1.5 p-2.5"
              style={{ background: colors.background }}
              aria-hidden="true"
            >
              <span
                className="flex h-14 flex-1 flex-col justify-between rounded-md p-2 shadow-card"
                style={{ background: colors.surface }}
              >
                <span className="h-1.5 w-3/4 rounded-full" style={{ background: colors.text }} />
                <span
                  className="h-1.5 w-1/2 rounded-full opacity-40"
                  style={{ background: colors.text }}
                />
                <span className="h-3 w-10 rounded-sm" style={{ background: colors.accent }} />
              </span>
              {theme.id === 'custom' && (
                <Palette
                  className="absolute top-2 left-2 size-4"
                  style={{ color: colors.accent }}
                />
              )}
            </span>
            <span className="flex items-start justify-between gap-2 border-t border-border bg-surface px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{theme.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {theme.description}
                </span>
              </span>
              {checked && (
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-3.5" aria-hidden="true" />
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
