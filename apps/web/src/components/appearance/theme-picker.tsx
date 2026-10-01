import { type AppearanceConfig, THEME_IDS, type ThemeId } from '@app/shared';
import { Check, Palette } from 'lucide-react';
import { radioOptionProps } from '@/components/ui/use-radio-group';
import { cn } from '@/lib/cn';
import { THEMES, themePreview } from '@/lib/appearance/themes';

/**
 * Theme cards: each one is a miniature of the real interface in that theme
 * (canvas, a card, text lines, and the accent) for the current mode. The
 * selected card has a check mark and a thicker outline, not just a color.
 * `compact` (the sign-in pages' appearance popover) shows smaller cards
 * without descriptions; `themes` limits the choice.
 */
export function ThemePicker({
  config,
  onChange,
  themes = THEME_IDS,
  compact = false,
}: {
  config: AppearanceConfig;
  onChange: (theme: ThemeId) => void;
  themes?: readonly ThemeId[];
  compact?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        'grid',
        compact
          ? 'grid-cols-3 gap-2'
          : 'grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6',
      )}
    >
      {THEMES.filter((theme) => themes.includes(theme.id)).map((theme) => {
        const colors = themePreview(theme.id, config);
        const checked = config.theme === theme.id;
        return (
          <button
            key={theme.id}
            {...radioOptionProps(themes, config.theme, onChange, theme.id)}
            aria-label={`${theme.name} theme`}
            className={cn(
              'group relative flex flex-col overflow-hidden rounded-card border text-left focus-ring transition',
              checked
                ? 'border-primary ring-2 ring-primary'
                : 'border-border hover:border-border-strong',
            )}
          >
            <span
              className={cn(
                'relative flex items-end gap-1.5',
                compact ? 'h-11 p-1.5' : 'h-20 p-2.5',
              )}
              style={{ background: colors.background }}
              aria-hidden="true"
            >
              <span
                className={cn(
                  'flex flex-1 flex-col justify-between rounded-md shadow-card',
                  compact ? 'h-8 p-1.5' : 'h-14 p-2',
                )}
                style={{ background: colors.surface }}
              >
                <span className="h-1.5 w-3/4 rounded-full" style={{ background: colors.text }} />
                <span
                  className="h-1.5 w-1/2 rounded-full opacity-40"
                  style={{ background: colors.text }}
                />
                <span
                  className={cn('rounded-sm', compact ? 'h-2 w-6' : 'h-3 w-10')}
                  style={{ background: colors.accent }}
                />
              </span>
              {theme.id === 'custom' && (
                <Palette
                  className="absolute top-2 left-2 size-4"
                  style={{ color: colors.accent }}
                />
              )}
            </span>
            <span
              className={cn(
                'flex items-start justify-between gap-2 border-t border-border bg-surface',
                compact ? 'px-2 py-1.5' : 'px-3 py-2',
              )}
            >
              <span className="min-w-0">
                <span className={cn('block truncate font-medium', compact ? 'text-xs' : 'text-sm')}>
                  {theme.name}
                </span>
                {!compact && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {theme.description}
                  </span>
                )}
              </span>
              {checked && (
                <span
                  className={cn(
                    'flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground',
                    compact ? 'size-4' : 'mt-0.5 size-5',
                  )}
                >
                  <Check className={compact ? 'size-3' : 'size-3.5'} aria-hidden="true" />
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
