import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Placeholder logomark. Replace when final branding is decided. */
export function BrandMark({ className, ...props }: ComponentProps<'svg'>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn('size-7 shrink-0', className)}
      {...props}
    >
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M10 22V10l12 12V10"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
