import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { radioOptionProps } from './use-radio-group';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

/**
 * A small set of mutually exclusive options shown side by side (an
 * accessible radio group). The selected option is marked by fill AND weight,
 * not color alone.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  /** Accessible name of the group. */
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const values = options.map((option) => option.value);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex w-full rounded-control border border-border bg-surface-muted p-1 sm:w-auto',
        className,
      )}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            {...radioOptionProps(values, value, onChange, option.value)}
            className={cn(
              'flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] px-3 text-sm whitespace-nowrap text-muted-foreground focus-ring transition-colors sm:flex-none [&_svg]:size-4',
              checked
                ? 'bg-surface font-semibold text-foreground shadow-card'
                : 'hover:text-foreground',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
