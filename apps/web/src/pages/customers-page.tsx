import type { Customer } from '@app/shared';
import { Archive, ArchiveRestore, Pencil, Plus, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArchiveCustomerDialog } from '@/components/customers/archive-customer-dialog';
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/layout/page-state';
import { PaginationBar } from '@/components/layout/pagination-bar';
import { ActiveBadge } from '@/components/orders/order-status-badge';
import { Can } from '@/components/organization/can';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { SearchInput } from '@/components/ui/search-input';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCustomers, useCustomerStatusChange } from '@/hooks/use-sales';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { sales } from '@/i18n/messages/sales';
import { useApiErrorMessage } from '@/lib/api-errors';
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
  const m = useMessages(sales).customers;
  const c = useMessages(common);
  const errorMessage = useApiErrorMessage();
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
          setNotice(
            action === 'archive'
              ? m.archivedNotice({ name: customer.name })
              : m.restoredNotice({ name: customer.name }),
          );
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
        {m.add}
      </Button>
    </Can>
  );

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`${m.title} · ${organization.name}`)}</title>
      <PageHeader title={m.title} description={m.description} actions={addButton} />

      <search className="flex flex-col gap-3 md:flex-row md:items-center">
        <SearchInput
          wrapperClassName="md:max-w-sm md:flex-1"

          aria-label={m.search}
          placeholder={m.searchPlaceholder}
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:flex md:flex-none">
          <Select
            aria-label={m.status}
            wrapperClassName="md:w-40"
            value={params.status}
            onChange={(event) =>
              setParams({ status: event.target.value as CustomerParams['status'] })
            }
          >
            <option value="ACTIVE">{m.active}</option>
            <option value="ARCHIVED">{m.archived}</option>
            <option value="ALL">{m.all}</option>
          </Select>
          <Select
            aria-label={m.sort}
            wrapperClassName="md:w-48"
            value={params.sort}
            onChange={(event) => setParams({ sort: event.target.value as CustomerParams['sort'] })}
          >
            {CUSTOMER_SORT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {m.sortOptions[option]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2 md:ml-auto">
          {customers.isFetching && !customers.isPending && (
            <Spinner size="sm" label={m.updating} className="text-muted-foreground" />
          )}
          {filtered && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X aria-hidden="true" />
              {c.actions.clearFilters}
            </Button>
          )}
        </div>
      </search>

      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {statusChange.isError && !archiveTarget && (
        <Alert tone="danger">{errorMessage(statusChange.error)}</Alert>
      )}

      {customers.isPending && <ListSkeleton label={m.loading} />}
      {customers.isError && (
        <ErrorState
          title={m.loadError}
          error={customers.error}
          onRetry={() => void customers.refetch()}
        />
      )}

      {data && data.pagination.totalItems === 0 && (
        <EmptyState
          icon={<Users className="size-5" aria-hidden="true" />}
          title={filtered ? m.noMatches : m.emptyTitle}
          description={filtered ? undefined : m.emptyText}
          action={
            filtered ? (
              <Button variant="secondary" onClick={clearFilters}>
                {c.actions.clearFilters}
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
            <Table className="hidden @4xl:table">
              <TableHeader>
                <tr>
                  <TableHead>{m.name}</TableHead>
                  <TableHead>{m.company}</TableHead>
                  <TableHead>{m.contact}</TableHead>
                  <TableHead align="right">{m.orders}</TableHead>
                  <TableHead>{m.status}</TableHead>
                  <TableHead>
                    <span className="sr-only">{m.actions}</span>
                  </TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {data.items.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="max-w-52">
                      <Link
                        to={paths.customer(organization.id, customer.id)}
                        className="block truncate rounded-sm font-medium focus-ring hover:underline"
                      >
                        {customer.name}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-52 truncate">
                      {customer.companyName ?? <span className="text-subtle-foreground">—</span>}
                    </TableCell>
                    <TableCell className="max-w-60 text-muted-foreground">
                      <span className="block truncate">{customer.email ?? '—'}</span>
                      {customer.phone && (
                        <span className="block truncate text-xs">{customer.phone}</span>
                      )}
                    </TableCell>
                    <TableCell align="right">{customer.orderCount}</TableCell>
                    <TableCell>
                      <ActiveBadge isActive={customer.isActive} />
                    </TableCell>
                    <TableCell className="py-2">
                      <CustomerActions customer={customer} actions={actions} compact />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ul className="divide-y divide-border @4xl:hidden" aria-label={m.list}>
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
                    {[customer.email, customer.phone].filter(Boolean).join(' · ') || m.noContact}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.orderCount({ count: customer.orderCount })}
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
  const m = useMessages(sales).customers;
  const size = compact ? 'icon-sm' : 'sm';
  return (
    <div className="flex flex-wrap items-center gap-1 @4xl:flex-nowrap @4xl:justify-end">
      {can('CUSTOMERS_UPDATE') && (
        <Button
          variant="ghost"
          size={size}
          onClick={() => actions.edit(customer)}
          aria-label={m.editNamed({ name: customer.name })}
          title={compact ? m.edit : undefined}
        >
          <Pencil aria-hidden="true" />
          {!compact && m.edit}
        </Button>
      )}
      {can('CUSTOMERS_ARCHIVE') &&
        (customer.isActive ? (
          <Button
            variant="ghost"
            size={size}
            onClick={() => actions.archive(customer)}
            aria-label={m.archiveNamed({ name: customer.name })}
            title={compact ? m.archive : undefined}
          >
            <Archive aria-hidden="true" />
            {!compact && m.archive}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size={size}
            onClick={() => actions.restore(customer)}
            aria-label={m.restoreNamed({ name: customer.name })}
            title={compact ? m.restore : undefined}
          >
            <ArchiveRestore aria-hidden="true" />
            {!compact && m.restore}
          </Button>
        ))}
    </div>
  );
}
