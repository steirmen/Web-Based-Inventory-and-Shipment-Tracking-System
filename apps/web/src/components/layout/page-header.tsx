import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface PageHeaderProps extends Omit<ComponentProps<'header'>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  /** Small label above the title, e.g. a section name. */
  eyebrow?: ReactNode;
  /** Page-level actions, aligned to the right on wider screens. */
  actions?: ReactNode;
}

/** Top of every page: the page's single `<h1>`, an optional description, and actions. */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6',
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        {eyebrow && (
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">{eyebrow}</p>
        )}
        <h1 className="text-2xl leading-8 font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
