import { Search } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Input } from './input';

export interface SearchInputProps extends Omit<ComponentProps<'input'>, 'type'> {
  /** Classes for the positioning wrapper (e.g. width in a filter bar). */
  wrapperClassName?: string;
}

/**
 * Search field with a leading magnifier, used by every list filter bar and
 * picker. A native `type="search"` input (Escape clears it in most browsers);
 * give it an accessible name with `aria-label` or `FormField`.
 */
export function SearchInput({
  wrapperClassName,
  className,
  maxLength = 100,
  ...props
}: SearchInputProps) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        autoComplete="off"
        maxLength={maxLength}
        className={cn('pl-9', className)}
        {...props}
      />
    </div>
  );
}
