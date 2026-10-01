import type { Customer } from '@app/shared';
import { Archive, ArchiveRestore, Pencil, Plus, Search, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArchiveCustomerDialog } from '@/components/customers/archive-customer-dialog';
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/page-state';
import { PaginationBar } from '@/components/layout/pagination-bar';
import { ActiveBadge } from '@/components/orders/order-status-badge';
import { Can } from '@/components/organization/can';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useCustomers, useCustomerStatusChange } from '@/hooks/use-sales';
import { apiErrorMessage } from '@/lib/api-errors';
import { pageTitle } from '@/lib/app-config';
import { cn } from '@/lib/cn';
import { useCurrentOrganization } from '@/lib/organization-context';
import {
  CUSTOMER_SORT_OPTIONS,
  type CustomerParams,
  readCustomerParams,
  toCustomerQuery,
  writeCustomerParams,
} from '@/lib/sales-params';
import { paths } from '@/routes/paths';

const SEARCH_DEBOUNCE_MS = 300;

type Editing = { mode: 'create' } | { mode: 'edit'; customer: Customer } | null;

/**
 * Customers of the workspace, with server-side search, status filter,
 * sorting, and pagination in the URL. Archiving keeps a customer on its orders.
 */
export function CustomersPage() {
  const { organization } = useCurrentOrganization();
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readCustomerParams(searchParams);
  const customers = useCustomers(organization.id, toCustomerQuery(params));
  const statusChange = useCustomerStatusChange(organization.id);
  const [searchInput, setSearchInput] = useState(params.search);
  const [editing, setEditing] = useState<Editing>(null);
  const [archiveTarget, setArchiveTarget] = useState<Customer | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const setParams = (changes: Partial<CustomerParams>) =>
    setSearchParams(writeCustomerParams({ ...params, page: 1, ...changes }));

  useEffect(() => {
    if (searchInput.trim() === params.search.trim()) return;
    const timeout = setTimeout(() => {
      setSearchParams(
        (current) =>
          writeCustomerParams({ ...readCustomerParams(current), search: searchInput, page: 1 }),
        { replace: true },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchInput, params.search, setSearchParams]);

  const changeStatus = (customer: Customer, action: 'archive' | 'restore') => {
    setNotice(null);
    statusChange.mutate(
      { customerId: customer.id, action },
      {
        onSuccess: () => {
          setArchiveTarget(null);
          setNotice(`${customer.name} ${action === 'archive' ? 'archived' : 'restored'}.`);
        },
      },
    );
  };

  const actions = {
    edit: (customer: Customer) => {
      setNotice(null);
      setEditing({ mode: 'edit', customer });
    },
    archive: (customer: Customer) => {
      statusChange.reset();
      setArchiveTarget(customer);
    },
    restore: (customer: Customer) => changeStatus(customer, 'restore'),
  };

  const filtered = Boolean(params.search.trim()) || params.status !== 'ACTIVE';
  const clearFilters = () => {
    setSearchInput('');
    setParams({ search: '', status: 'ACTIVE' });
  };
  const data = customers.data;
  const addButton = (
    <Can permission="CUSTOMERS_CREATE">
      <Button
        onClick={() => {
          setNotice(null);
          setEditing({ mode: 'create' });
        }}
      >
        <Plus aria-hidden="true" />
        Add customer
      </Button>
    </Can>
  );

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`Customers · ${organization.name}`)}</title>
      <PageHeader
        title="Customers"
        description="People and businesses you sell to. Archived customers stay on their orders."
        actions={addButton}
      />

      <search className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative md:max-w-sm md:flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search customers"
            placeholder="Name, company, email, or phone…"
            className="pl-9"
            maxLength={100}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:flex md:flex-none">
          <Select
            aria-label="Status"
            wrapperClassName="md:w-40"
            value={params.status}
            onChange={(event) =>
              setParams({ status: event.target.value as CustomerParams['status'] })
            }
          >
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
            <option value="ALL">All customers</option>
          </Select>
          <Select
            aria-label="Sort"
            wrapperClassName="md:w-48"
            value={params.sort}
            onChange={(event) => setParams({ sort: event.target.value as CustomerParams['sort'] })}
          >
            {CUSTOMER_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2 md:ml-auto">
          {customers.isFetching && !customers.isPending && (
            <Spinner size="sm" label="Updating results" className="text-muted-foreground" />
          )}
          {filtered && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X aria-hidden="true" />
              Clear filters
            </Button>
          )}
        </div>
      </search>

      {notice && <Alert tone="success">{notice}</Alert>}
      {statusChange.isError && !archiveTarget && (
        <Alert tone="danger">{apiErrorMessage(statusChange.error)}</Alert>
      )}

      {customers.isPending && <LoadingState label="Loading customers" />}
      {customers.isError && (
        <ErrorState
          title="We couldn't load customers"
          error={customers.error}
          onRetry={() => void customers.refetch()}
        />
      )}

      {data && data.pagination.totalItems === 0 && (
        <EmptyState
          icon={<Users className="size-5" aria-hidden="true" />}
          title={filtered ? 'No customers match your filters.' : 'No customers yet'}
          description={filtered ? undefined : 'Add the people and businesses you sell to.'}
          action={
            filtered ? (
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              addButton
            )
          }
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <Card className={cn('overflow-hidden', customers.isPlaceholderData && 'opacity-70')}>
            <table className="hidden w-full text-sm lg:table">
              <thead className="border-b border-border bg-surface-muted/60 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Name
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Company
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Contact
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Orders
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((customer) => (
                  <tr key={customer.id}>
                    <td className="max-w-52 px-4 py-3">
                      <Link
                        to={paths.customer(organization.id, customer.id)}
                        className="block truncate rounded-sm font-medium focus-ring hover:underline"
                      >
                        {customer.name}
                      </Link>
                    </td>
                    <td className="max-w-52 truncate px-4 py-3">
                      {customer.companyName ?? <span className="text-subtle-foreground">—</span>}
                    </td>
                    <td className="max-w-60 px-4 py-3 text-muted-foreground">
                      <span className="block truncate">{customer.email ?? '—'}</span>
                      {customer.phone && (
                        <span className="block truncate text-xs">{customer.phone}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{customer.orderCount}</td>
                    <td className="px-4 py-3">
                      <ActiveBadge isActive={customer.isActive} />
                    </td>
                    <td className="px-4 py-2">
                      <CustomerActions customer={customer} actions={actions} compact />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-border lg:hidden" aria-label="Customers">
              {data.items.map((customer) => (
                <li key={customer.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={paths.customer(organization.id, customer.id)}
                        className="block truncate rounded-sm font-medium focus-ring hover:underline"
                      >
                        {customer.name}
                      </Link>
                      {customer.companyName && (
                        <p className="truncate text-sm text-muted-foreground">
                          {customer.companyName}
                        </p>
                      )}
                    </div>
                    <ActiveBadge isActive={customer.isActive} />
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {[customer.email, customer.phone].filter(Boolean).join(' · ') ||
                      'No contact details'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {customer.orderCount} {customer.orderCount === 1 ? 'order' : 'orders'}
                  </p>
                  <CustomerActions customer={customer} actions={actions} />
                </li>
              ))}
            </ul>
          </Card>
          <PaginationBar
            page={data.pagination.page}
            pageSize={data.pagination.pageSize}
            totalPages={data.pagination.totalPages}
            totalItems={data.pagination.totalItems}
            disabled={customers.isPlaceholderData}
            onPageChange={(page) => setParams({ page })}
          />
        </>
      )}

      <CustomerFormDialog
        open={editing !== null}
        customer={editing?.mode === 'edit' ? editing.customer : null}
        onClose={() => setEditing(null)}
        onSaved={(message) => {
          setEditing(null);
          setNotice(message);
        }}
      />
      <ArchiveCustomerDialog
        customer={archiveTarget}
        pending={statusChange.isPending}
        error={statusChange.error}
        onConfirm={() => archiveTarget && changeStatus(archiveTarget, 'archive')}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  );
}

function CustomerActions({
  customer,
  actions,
  compact = false,
}: {
  customer: Customer;
  actions: {
    edit: (customer: Customer) => void;
    archive: (customer: Customer) => void;
    restore: (customer: Customer) => void;
  };
  compact?: boolean;
}) {
  const { can } = useCurrentOrganization();
  const iconOnly = cn(compact && 'size-8 px-0');
  return (
    <div className="flex flex-wrap items-center gap-1 lg:flex-nowrap lg:justify-end">
      {can('CUSTOMERS_UPDATE') && (
        <Button
          variant="ghost"
          size="sm"
          className={iconOnly}
          onClick={() => actions.edit(customer)}
          aria-label={`Edit ${customer.name}`}
          title={compact ? 'Edit' : undefined}
        >
          <Pencil aria-hidden="true" />
          {!compact && 'Edit'}
        </Button>
      )}
      {can('CUSTOMERS_ARCHIVE') &&
        (customer.isActive ? (
          <Button
            variant="ghost"
            size="sm"
            className={iconOnly}
            onClick={() => actions.archive(customer)}
            aria-label={`Archive ${customer.name}`}
            title={compact ? 'Archive' : undefined}
          >
            <Archive aria-hidden="true" />
            {!compact && 'Archive'}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className={iconOnly}
            onClick={() => actions.restore(customer)}
            aria-label={`Restore ${customer.name}`}
            title={compact ? 'Restore' : undefined}
          >
            <ArchiveRestore aria-hidden="true" />
            {!compact && 'Restore'}
          </Button>
        ))}
    </div>
  );
}
