import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/**
 * Single-line text input. Mark invalid values with `aria-invalid` — it drives
 * the error styling and is announced by screen readers.
 */
export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'h-9 w-full min-w-0 rounded-control border border-border-strong bg-surface px-3 text-sm text-foreground shadow-card focus-ring',
        'transition-colors duration-150 placeholder:text-subtle-foreground',
        'enabled:hover:border-subtle-foreground/60',
        'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-subtle-foreground',
        'aria-invalid:border-danger aria-invalid:focus-visible:outline-danger',
        className,
      )}
      {...props}
    />
  );
}
