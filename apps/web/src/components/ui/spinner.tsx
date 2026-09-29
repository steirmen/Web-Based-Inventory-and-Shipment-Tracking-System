import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

const sizes = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-8',
} as const;

export interface SpinnerProps extends Omit<ComponentProps<'span'>, 'children'> {
  size?: keyof typeof sizes;
  /** Accessible label announced to screen readers. Pass `null` when the surrounding UI already conveys loading. */
  label?: string | null;
}

/** Indeterminate loading indicator. Inherits the current text color. */
export function Spinner({ size = 'md', label = 'Loading', className, ...props }: SpinnerProps) {
  return (
    <span
      role={label ? 'status' : undefined}
      className={cn('inline-flex shrink-0 text-current', className)}
      {...props}
    >
      <svg
        className={cn('animate-spin', sizes[size])}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
