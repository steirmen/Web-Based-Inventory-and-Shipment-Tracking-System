/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role, jsx-a11y/click-events-have-key-events */
// The WAI-ARIA combobox pattern: an <input role="combobox"> owning a role="listbox" of
// role="option" items. Native <select>/<datalist> can't search on the server or offer a
// "Create" option. The keyboard is handled on the input (aria-activedescendant), so the
// options' click handlers are for pointers only.
import type { Category } from '@app/shared';
import { Check, Plus, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import type { FieldControlProps } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useCategorySearch, useCreateCategory } from '@/hooks/use-catalog';
import { useMessages } from '@/i18n/i18n-context';
import { catalog } from '@/i18n/messages/catalog';
import { hasErrorCode, useApiErrorMessage } from '@/lib/api-errors';
import { cn } from '@/lib/cn';
import { useCurrentOrganization } from '@/lib/organization-context';
import { normalizeCategoryName } from '@/lib/product-form';

const SEARCH_DEBOUNCE_MS = 200;

export interface CategoryChoice {
  id: string;
  name: string;
}

type Option = { kind: 'category'; category: Category } | { kind: 'create'; name: string };

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The product form's category field: a combobox (WAI-ARIA combobox pattern)
 * over the categories of THIS workspace. Typing searches on the server; ↑/↓
 * move through the suggestions, Enter chooses, Escape closes and restores
 * the current choice. When nothing matches the typed name and the member may
 * create categories (CATEGORIES_CREATE), a "Create “…”" option adds it and
 * selects it. A name that already exists (case-insensitively) is never
 * created twice: the existing category is selected instead.
 */
export function CategoryPicker({
  control,
  value,
  onChange,
}: {
  control: FieldControlProps;
  value: CategoryChoice | null;
  onChange: (category: CategoryChoice | null) => void;
}) {
  const { organization, can } = useCurrentOrganization();
  const m = useMessages(catalog).picker;
  const errorMessage = useApiErrorMessage();
  const create = useCreateCategory(organization.id);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState(value?.name ?? '');
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setTerm(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [input]);

  // Showing the current choice is not a search: list everything then.
  const searching = term !== '' && !(value && sameName(term, value.name));
  const results = useCategorySearch(organization.id, searching ? term : '', open);
  const categories = results.data?.categories ?? [];
  const sorted = searching
    ? categories
    : [...categories].sort((a, b) => a.name.localeCompare(b.name));
  const typed = normalizeCategoryName(input);
  const settled = results.isSuccess && !results.isPlaceholderData && !results.isFetching;
  const canCreate =
    can('CATEGORIES_CREATE') &&
    searching &&
    typed !== '' &&
    settled &&
    !categories.some((category) => sameName(category.name, typed));
  const options: Option[] = [
    ...sorted.map((category): Option => ({ kind: 'category', category })),
    ...(canCreate ? [{ kind: 'create', name: typed } satisfies Option] : []),
  ];
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0));

  const restore = () => setInput(value?.name ?? '');
  const choose = (category: CategoryChoice | null, message?: string) => {
    onChange(category);
    setInput(category?.name ?? '');
    setOpen(false);
    setCreateError(null);
    setAnnouncement(message ?? (category ? m.selected({ name: category.name }) : ''));
  };

  const createCategory = (name: string) => {
    setCreateError(null);
    create.mutate(
      { name },
      {
        onSuccess: ({ category }) => choose(category, m.created({ name: category.name })),
        onError: async (error) => {
          // Someone (or another tab) created it meanwhile: select the existing one.
          if (hasErrorCode(error, 'CATEGORY_NAME_TAKEN')) {
            const refreshed = await results.refetch();
            const existing = refreshed.data?.categories.find((c) => sameName(c.name, name));
            if (existing) {
              choose(existing, m.existing({ name: existing.name }));
              return;
            }
          }
          setCreateError(errorMessage(error));
        },
      },
    );
  };

  const pick = (option: Option | undefined) => {
    if (!option) return;
    if (option.kind === 'category') choose(option.category);
    else createCategory(option.name);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + delta + options.length) % Math.max(options.length, 1));
    } else if (event.key === 'Enter') {
      if (open && options.length > 0) {
        // Choosing a suggestion never submits the product form.
        event.preventDefault();
        pick(options[activeIndex]);
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
        restore();
      }
    } else if (event.key === 'Home' && open) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End' && open) {
      event.preventDefault();
      setActive(Math.max(options.length - 1, 0));
    }
  };

  const status = !open
    ? null
    : results.isPending
      ? m.searching
      : results.isError
        ? m.loadError
        : options.length === 0
          ? searching
            ? m.noMatches({ term })
            : m.empty
          : null;

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
          restore();
        }
      }}
    >
      <div className="relative">
        <Input
          {...control}
          ref={inputRef}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && options.length > 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          placeholder={m.placeholder}
          className={cn(value && 'pr-9')}
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setOpen(true);
            setActive(0);
            setCreateError(null);
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {value && (
          <button
            type="button"
            aria-label={m.clear}
            title={m.clear}
            className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-control text-subtle-foreground focus-ring hover:text-foreground"
            onClick={() => {
              choose(null, m.noCategory);
              inputRef.current?.focus();
            }}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div
        className={cn(
          'absolute top-full right-0 left-0 z-40 mt-1 max-h-72 overflow-y-auto rounded-card border border-border bg-surface p-1 shadow-raised',
          !open && 'hidden',
        )}
      >
        <ul id={listId} role="listbox" aria-label={m.suggestions}>
          {options.map((option, index) => {
            const isActive = index === activeIndex;
            if (option.kind === 'create') {
              return (
                <li
                  key="create"
                  id={optionId(index)}
                  role="option"
                  aria-selected={false}
                  data-active={isActive || undefined}
                  className="flex cursor-pointer items-center gap-2 rounded-control px-2.5 py-2 text-sm font-medium text-primary data-active:bg-surface-muted"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(option)}
                >
                  {create.isPending ? (
                    <Spinner size="sm" label={null} />
                  ) : (
                    <Plus className="size-4 shrink-0" aria-hidden="true" />
                  )}
                  <span className="min-w-0 truncate">
                    {create.isPending
                      ? m.creating({ name: option.name })
                      : m.create({ name: option.name })}
                  </span>
                </li>
              );
            }
            const selected = value?.id === option.category.id;
            return (
              <li
                key={option.category.id}
                id={optionId(index)}
                role="option"
                aria-selected={selected}
                data-active={isActive || undefined}
                className="flex cursor-pointer items-center gap-2 rounded-control px-2.5 py-2 text-sm text-foreground data-active:bg-surface-muted"
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(option)}
              >
                <span className={cn('min-w-0 flex-1 truncate', selected && 'font-semibold')}>
                  {option.category.name}
                </span>
                {selected && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
        {status && (
          <p className="flex items-center gap-2 px-2.5 py-2 text-sm text-muted-foreground">
            {results.isPending && <Spinner size="sm" label={null} />}
            {status}
            {results.isError && (
              <button
                type="button"
                className="ml-auto rounded-sm font-medium text-primary focus-ring hover:underline"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void results.refetch()}
              >
                {m.retry}
              </button>
            )}
          </p>
        )}
      </div>

      {createError && (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {createError}
        </p>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
