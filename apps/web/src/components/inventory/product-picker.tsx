import { useEffect, useState } from 'react';
import type { FieldControlProps } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { SearchInput } from '@/components/ui/search-input';
import type { Currency } from '@app/shared';
import { useProducts } from '@/hooks/use-catalog';
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { stock } from '@/i18n/messages/stock';
import { useCurrentOrganization } from '@/lib/organization-context';

const SEARCH_DEBOUNCE_MS = 250;
const RESULT_LIMIT = 50;

/** What the picker needs to know about a product. */
export interface ProductChoice {
  id: string;
  name: string;
  sku: string;
  /** Current price (decimal string), when chosen from the product search. */
  price?: string;
  /** Currency of the price. */
  currency?: Currency;
}

/**
 * Chooses an ACTIVE product: the search runs on the server (name or SKU), and
 * the select shows up to 50 matches, so large catalogs are never loaded whole.
 */
export function ProductPicker({
  control,
  value,
  selected,
  onChange,
  showPrice = false,
}: {
  control: FieldControlProps;
  value: string;
  /** The chosen product, kept selectable even when a new search no longer matches it. */
  selected: ProductChoice | null;
  onChange: (product: ProductChoice | null) => void;
  /** Show each product's price in its currency (the order builder). */
  showPrice?: boolean;
}) {
  const { organization } = useCurrentOrganization();
  const m = useMessages(stock).productPicker;
  const f = useFormat();
  const label = (product: ProductChoice) =>
    showPrice && product.price
      ? `${product.name} (${product.sku}) · ${f.money(product.price, product.currency ?? null)}`
      : `${product.name} (${product.sku})`;
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [input]);

  const products = useProducts(organization.id, {
    ...(search ? { search } : {}),
    status: 'ACTIVE',
    sortBy: 'name',
    sortOrder: 'asc',
    page: 1,
    pageSize: RESULT_LIMIT,
  });
  const items = products.data?.items ?? [];
  const total = products.data?.pagination.totalItems ?? 0;

  return (
    <div className="flex flex-col gap-2">
      <SearchInput
        aria-label={m.search}
        placeholder={m.placeholder}
        value={input}
        onChange={(event) => setInput(event.target.value)}
      />
      <Select
        {...control}
        name="productId"
        value={value}
        onChange={(event) =>
          onChange(
            items.find((product) => product.id === event.target.value) ??
              (selected?.id === event.target.value ? selected : null),
          )
        }
      >
        <option value="">
          {products.isPending ? m.loading : items.length === 0 ? m.noMatches : m.choose}
        </option>
        {selected && !items.some((product) => product.id === selected.id) && (
          <option value={selected.id}>{label(selected)}</option>
        )}
        {items.map((product) => (
          <option key={product.id} value={product.id}>
            {label(product)}
          </option>
        ))}
      </Select>
      {total > items.length && (
        <p className="text-xs text-muted-foreground">
          {m.showingFirst({ shown: f.number(items.length), total: f.number(total) })}
        </p>
      )}
    </div>
  );
}
