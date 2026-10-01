import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/**
 * Placeholder block shown while content loads. Decorative (hidden from
 * assistive technology): the surrounding region announces the loading state.
 * The pulse stops under reduced motion (global rule in globals.css).
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-control bg-surface-muted', className)}
      {...props}
    />
  );
}
