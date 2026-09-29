import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Form label. Always associate it with a control via `htmlFor` (or by nesting the control). */
export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    // oxlint-disable-next-line jsx-a11y/label-has-associated-control -- association is provided by the caller
    <label
      className={cn(
        'text-sm leading-none font-medium text-foreground select-none peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
