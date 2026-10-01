import { cva } from 'class-variance-authority';

/**
 * Button styles. Kept separate from `button.tsx` so links and other elements
 * can look like buttons: `<Link className={buttonVariants({ variant: 'secondary' })} />`.
 *
 * Hierarchy (one primary action per view):
 * - `primary`: the main action of a page or dialog (Save, Add product).
 * - `secondary`: alternatives and Cancel.
 * - `ghost`: tertiary, low-emphasis actions (Clear filters, row actions).
 * - `danger`: irreversible or destructive confirmations (Delete, Cancel order).
 * Icon-only buttons use `size="icon"` / `"icon-sm"` and always need an `aria-label`.
 */
export const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap focus-ring select-none',
    'transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:translate-y-px',
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
        icon: 'size-9 px-0',
        'icon-sm': 'size-8 px-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);
