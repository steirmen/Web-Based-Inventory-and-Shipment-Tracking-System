import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs leading-4 font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-surface-muted text-muted-foreground',
        primary: 'border-primary/15 bg-primary-soft text-primary-soft-foreground',
        success: 'border-success-border bg-success-soft text-success-soft-foreground',
        warning: 'border-warning-border bg-warning-soft text-warning-soft-foreground',
        danger: 'border-danger-border bg-danger-soft text-danger-soft-foreground',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

export interface BadgeProps extends ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  /** Prepends a small status dot. */
  dot?: boolean;
}

/** Compact label for statuses and metadata. Pair color with text — never rely on color alone. */
export function Badge({ className, tone, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}
