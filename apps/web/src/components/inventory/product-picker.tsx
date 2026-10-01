import { useEffect, useState } from 'react';
import type { FieldControlProps } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { SearchInput } from '@/components/ui/search-input';
import { useProducts } from '@/hooks/use-catalog';
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
}: {
  control: FieldControlProps;
  value: string;
  /** The chosen product, kept selectable even when a new search no longer matches it. */
  selected: ProductChoice | null;
  onChange: (product: ProductChoice | null) => void;
}) {
  const { organization } = useCurrentOrganization();
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
        aria-label="Search products by name or SKU"
        placeholder="Search by name or SKU…"
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
          {products.isPending
            ? 'Loading products…'
            : items.length === 0
              ? 'No active products match'
              : 'Choose a product'}
        </option>
        {selected && !items.some((product) => product.id === selected.id) && (
          <option value={selected.id}>
            {selected.name} ({selected.sku})
          </option>
        )}
        {items.map((product) => (
          <option key={product.id} value={product.id}>
            {product.name} ({product.sku})
          </option>
        ))}
      </Select>
      {total > items.length && (
        <p className="text-xs text-muted-foreground">
          Showing the first {items.length} of {total} matches. Refine the search to find others.
        </p>
      )}
    </div>
  );
}
