import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Multi-line text input styled like `Input`. Mark invalid values with `aria-invalid`. */
export function Textarea({ className, rows = 4, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      rows={rows}
      className={cn(
        'min-h-20 w-full min-w-0 rounded-control border border-border-strong bg-surface px-3 py-2 text-sm text-foreground shadow-card focus-ring',
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
