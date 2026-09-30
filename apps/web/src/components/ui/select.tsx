import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

interface SelectProps extends ComponentProps<'select'> {
  /** Classes for the positioning wrapper (e.g. width). */
  wrapperClassName?: string;
}

/** Native select styled like `Input`. Mark invalid values with `aria-invalid`. */
export function Select({ className, wrapperClassName, children, ...props }: SelectProps) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <select
        className={cn(
          'h-9 w-full appearance-none rounded-control border border-border-strong bg-surface pr-9 pl-3 text-sm text-foreground shadow-card focus-ring',
          'transition-colors duration-150 enabled:hover:border-subtle-foreground/60',
          'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-subtle-foreground',
          'aria-invalid:border-danger',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-subtle-foreground"
        aria-hidden="true"
      />
    </div>
  );
}
