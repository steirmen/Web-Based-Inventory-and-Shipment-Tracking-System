import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/**
 * Data table parts, so every list (products, inventory, orders, reports, …)
 * has the same header, row height, alignment, and hover. Spacing derives
 * from the density setting through Tailwind's spacing scale; cells are a
 * little tighter while the content column is narrower than 64rem.
 *
 * Responsive rule: a wide table never makes the page scroll sideways. Every
 * table scrolls inside its own wrapper if it must. Workspace lists switch
 * between a table and stacked cards by the width of the CONTENT column (a
 * container query, so the sidebar is accounted for), e.g.
 * `className="hidden @3xl:table"` plus a card list with `@3xl:hidden`.
 * Reports keep the table at every width and scroll it.
 */
export function Table({
  className,
  wrapperClassName,
  ...props
}: ComponentProps<'table'> & { wrapperClassName?: string }) {
  return (
    <div className={cn('relative w-full overflow-x-auto', wrapperClassName)}>
      <table className={cn('w-full text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return (
    <thead
      className={cn(
        'border-b border-border bg-surface-muted/60 text-left text-xs font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('divide-y divide-border', className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn('transition-colors duration-150 hover:bg-surface-muted/40', className)}
      {...props}
    />
  );
}

interface AlignProps {
  /** Numbers and amounts are right-aligned (and use tabular figures). */
  align?: 'left' | 'right';
}

/** Column header. `scope="col"` by default; put sort buttons inside it. */
export function TableHead({
  className,
  align = 'left',
  scope = 'col',
  ...props
}: ComponentProps<'th'> & AlignProps) {
  return (
    <th
      scope={scope}
      className={cn(
        'px-3 py-2.5 font-medium whitespace-nowrap @5xl:px-4',
        align === 'right' && 'text-right',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  align = 'left',
  ...props
}: ComponentProps<'td'> & AlignProps) {
  return (
    <td
      className={cn(
        'px-3 py-3 @5xl:px-4',
        align === 'right' && 'text-right tabular-nums',
        className,
      )}
      {...props}
    />
  );
}
