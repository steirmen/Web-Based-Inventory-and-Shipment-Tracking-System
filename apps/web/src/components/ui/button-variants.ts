import { cva } from 'class-variance-authority';

/**
 * Button styles. Kept separate from `button.tsx` so links and other elements
 * can look like buttons: `<Link className={buttonVariants({ variant: 'secondary' })} />`.
 */
export const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap focus-ring select-none',
    'transition-colors duration-150',
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-card hover:bg-primary-hover',
        secondary:
          'border border-border-strong bg-surface text-foreground shadow-card hover:bg-surface-muted',
        ghost: 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
        danger: 'bg-danger text-danger-foreground shadow-card hover:bg-danger-hover',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4 text-sm',
        lg: 'h-10 px-5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);
