import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { buttonVariants } from './button-variants';
import { Spinner } from './spinner';

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Shows a spinner and disables the button while an action is in progress. */
  isLoading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  isLoading = false,
  disabled,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading && <Spinner size="sm" label={null} />}
      {children}
    </button>
  );
}
