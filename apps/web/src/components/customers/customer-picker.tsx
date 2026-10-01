import type { OrderCustomerRef } from '@app/shared';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FieldControlProps } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useCustomers } from '@/hooks/use-sales';
import { useCurrentOrganization } from '@/lib/organization-context';

const SEARCH_DEBOUNCE_MS = 250;
const RESULT_LIMIT = 50;

const describe = (customer: { name: string; companyName: string | null }) =>
  customer.companyName ? `${customer.name} — ${customer.companyName}` : customer.name;

/**
 * Chooses an ACTIVE customer of this workspace: the search runs on the server
 * (name, company, email, or phone) and the select shows up to 50 matches, so
 * the customer list is never loaded whole.
 */
export function CustomerPicker({
  control,
  selected,
  onChange,
}: {
  control: FieldControlProps;
  /** Kept selectable even when a new search no longer matches it. */
  selected: OrderCustomerRef | null;
  onChange: (customer: OrderCustomerRef | null) => void;
}) {
  const { organization } = useCurrentOrganization();
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [input]);

  const customers = useCustomers(organization.id, {
    ...(search ? { search } : {}),
    status: 'ACTIVE',
    sortBy: 'name',
    sortOrder: 'asc',
    page: 1,
    pageSize: RESULT_LIMIT,
  });
  const items = customers.data?.items ?? [];
  const total = customers.data?.pagination.totalItems ?? 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label="Search customers"
          placeholder="Search by name, company, email…"
          className="pl-9"
          maxLength={100}
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
      </div>
      <Select
        {...control}
        name="customerId"
        value={selected?.id ?? ''}
        onChange={(event) => {
          const found = items.find((customer) => customer.id === event.target.value);
          onChange(
            found
              ? {
                  id: found.id,
                  name: found.name,
                  companyName: found.companyName,
                  isActive: found.isActive,
                }
              : selected?.id === event.target.value
                ? selected
                : null,
          );
        }}
      >
        <option value="">
          {customers.isPending
            ? 'Loading customers…'
            : items.length === 0
              ? 'No active customers match'
              : 'Choose a customer'}
        </option>
        {selected && !items.some((customer) => customer.id === selected.id) && (
          <option value={selected.id}>
            {describe(selected)}
            {selected.isActive ? '' : ' (archived)'}
          </option>
        )}
        {items.map((customer) => (
          <option key={customer.id} value={customer.id}>
            {describe(customer)}
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
