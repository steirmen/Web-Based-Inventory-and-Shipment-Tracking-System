import { type Language } from '@app/shared';
import { radioOptionProps } from '@/components/ui/use-radio-group';
import { useLanguage, useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { cn } from '@/lib/cn';

/** Shown as "TR | EN"; each option is named in its own language. */
const OPTIONS: readonly Language[] = ['tr', 'en'];

/**
 * The compact TR | EN switch of the top bar and the sign-in pages: a radio
 * group (Tab reaches the selected language, ←/→ switch, the selection is
 * announced and shown by fill and weight, not color alone). Switching is
 * immediate and keeps the current page, workspace, and form input.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const { language, setLanguage } = useLanguage();
  const m = useMessages(common);

  return (
    <div
      role="radiogroup"
      aria-label={m.language.label}
      className={cn(
        'inline-flex shrink-0 rounded-full border border-border bg-surface-muted p-0.5',
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const checked = option === language;
        return (
          <button
            key={option}
            {...radioOptionProps(OPTIONS, language, setLanguage, option)}
            aria-label={m.language[option]}
            lang={option}
            className={cn(
              'flex h-7 min-w-9 items-center justify-center rounded-full px-2 text-xs tracking-wide focus-ring transition-colors duration-150',
              checked
                ? 'bg-surface font-semibold text-foreground shadow-card'
                : 'font-medium text-muted-foreground hover:text-foreground',
            )}
          >
            {option.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
