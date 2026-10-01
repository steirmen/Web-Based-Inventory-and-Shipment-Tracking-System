import type { CustomerStatus, OrderCustomerRef } from '@app/shared';
import { Search, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { FieldControlProps } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useCustomerSearch } from '@/hooks/use-sales';
import { apiErrorMessage } from '@/lib/api-errors';
import { cn } from '@/lib/cn';
import { useCurrentOrganization } from '@/lib/organization-context';

const SEARCH_DEBOUNCE_MS = 250;

const describe = (customer: { name: string; companyName: string | null }) =>
  customer.companyName ? `${customer.name} — ${customer.companyName}` : customer.name;

/**
 * Chooses a customer of THIS workspace with a server-side search (name,
 * company, email, or phone). The results open with the first customers by
 * name, narrow as you type, and load 20 more at a time ("Load more"), so
 * every customer is reachable without loading the whole list.
 *
 * Results are real buttons: ↓ from the search field moves into them, ↑/↓
 * move between them, Enter or Space chooses, Escape returns to the search.
 *
 * Orders may only use active customers (the default); report filters pass
 * `includeArchived`, since archived customers keep their order history.
 */
export function CustomerPicker({
  control,
  selected,
  onChange,
  includeArchived = false,
  placeholder = 'Search by name, company, email…',
}: {
  /** Label/description wiring from `FormField` (applied to the search field). */
  control: FieldControlProps;
  selected: OrderCustomerRef | null;
  onChange: (customer: OrderCustomerRef | null) => void;
  includeArchived?: boolean;
  placeholder?: string;
}) {
  const { organization } = useCurrentOrganization();
  const resultsId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [editing, setEditing] = useState(selected === null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [input]);

  const status: CustomerStatus | undefined = includeArchived ? undefined : 'ACTIVE';
  const results = useCustomerSearch(organization.id, { search, status });
  const items = results.data?.pages.flatMap((page) => page.items) ?? [];
  const total = results.data?.pages[0]?.pagination.totalItems ?? 0;

  const choose = (customer: OrderCustomerRef) => {
    onChange(customer);
    setOpen(false);
    setEditing(false);
    setInput('');
  };
  const startEditing = () => {
    setEditing(true);
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };
  const buttons = () => [...(listRef.current?.querySelectorAll('button') ?? [])];
  const close = () => {
    setOpen(false);
    inputRef.current?.focus();
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setTimeout(() => buttons()[0]?.focus(), 0);
    } else if (event.key === 'Escape') {
      setOpen(false);
      if (selected) setEditing(false);
    }
  };
  const onResultKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const all = buttons();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      all[Math.min(all.length - 1, index + 1)]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (index === 0) inputRef.current?.focus();
      else all[index - 1]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  if (!editing && selected) {
    return (
      <div className="flex min-h-9 items-center gap-2 rounded-control border border-border-strong bg-surface px-3 py-1 shadow-card">
        <span className="min-w-0 flex-1 truncate text-sm">
          {describe(selected)}
          {selected.isActive ? '' : ' (archived)'}
        </span>
        {/* The field's label, hint, and error belong to this button while a customer is chosen. */}
        <Button
          variant="ghost"
          size="sm"
          id={control.id}
          aria-label={`Change customer (${describe(selected)})`}
          aria-describedby={control['aria-describedby']}
          aria-invalid={control['aria-invalid']}
          onClick={startEditing}
        >
          Change
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="size-8 px-0"
          aria-label="Remove the customer"
          onClick={() => {
            onChange(null);
            startEditing();
          }}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        // Close when focus leaves the picker (not when it moves inside it).
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
          if (selected) setEditing(false);
        }
      }}
    >
      <Search
        className="pointer-events-none absolute top-[1.125rem] left-3 size-4 -translate-y-1/2 text-subtle-foreground"
        aria-hidden="true"
      />
      <Input
        {...control}
        ref={inputRef}
        type="search"
        aria-expanded={open}
        aria-controls={resultsId}
        autoComplete="off"
        placeholder={placeholder}
        className="pl-9"
        maxLength={100}
        value={input}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setInput(event.target.value);
          setOpen(true);
        }}
        onKeyDown={onInputKeyDown}
      />
      {open && (
        <div
          id={resultsId}
          className="absolute z-30 mt-1 flex max-h-80 w-full flex-col overflow-hidden rounded-control border border-border bg-surface shadow-raised"
        >
          {items.length > 0 && (
            <ul ref={listRef} aria-label="Matching customers" className="overflow-y-auto py-1">
              {items.map((customer, index) => {
                const isSelected = selected?.id === customer.id;
                const details = [
                  customer.companyName,
                  customer.email,
                  customer.isActive ? null : 'Archived',
                ].filter(Boolean);
                return (
                  <li key={customer.id}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() =>
                        choose({
                          id: customer.id,
                          name: customer.name,
                          companyName: customer.companyName,
                          isActive: customer.isActive,
                        })
                      }
                      onKeyDown={(event) => onResultKeyDown(event, index)}
                      className={cn(
                        'flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none',
                        isSelected && 'font-semibold',
                      )}
                    >
                      <span className="truncate text-foreground">{customer.name}</span>
                      {details.length > 0 && (
                        <span className="truncate text-xs font-normal text-muted-foreground">
                          {details.join(' · ')}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground first:border-t-0">
            {results.isPending ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" label={null} /> Loading customers…
              </span>
            ) : results.isError ? (
              <span className="flex flex-wrap items-center gap-2" role="alert">
                {apiErrorMessage(results.error)}
                <Button variant="ghost" size="sm" onClick={() => void results.refetch()}>
                  Try again
                </Button>
              </span>
            ) : items.length === 0 ? (
              <output>
                {search
                  ? `No ${status === 'ACTIVE' ? 'active ' : ''}customers match “${search}”.`
                  : `No ${status === 'ACTIVE' ? 'active ' : ''}customers yet.`}
              </output>
            ) : (
              <span className="flex flex-wrap items-center justify-between gap-2">
                <output>
                  Showing {items.length} of {total}
                </output>
                {results.hasNextPage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void results.fetchNextPage()}
                    isLoading={results.isFetchingNextPage}
                  >
                    Load more
                  </Button>
                )}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
