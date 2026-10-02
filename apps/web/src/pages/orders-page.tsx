import { ORDER_STATUSES, type OrderListItem } from '@app/shared';
import { ClipboardList, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/layout/page-state';
import { PaginationBar } from '@/components/layout/pagination-bar';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { Can } from '@/components/organization/can';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
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
import { useWarehouses } from '@/hooks/use-inventory';
import { useCustomer, useOrders } from '@/hooks/use-sales';
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { sales } from '@/i18n/messages/sales';
import { pageTitle } from '@/lib/app-config';
import { cn } from '@/lib/cn';
import { browserTimeZone } from '@/lib/local-days';
import { useCurrentOrganization } from '@/lib/organization-context';
import {
  hasOrderFilters,
  ORDER_SORT_OPTIONS,
  type OrderParams,
  readOrderParams,
  toOrderQuery,
  writeOrderParams,
} from '@/lib/sales-params';
import { paths } from '@/routes/paths';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Orders of the workspace: server-side search (order number, customer),
 * filters (status, customer, warehouse, dates), sorting, and pagination,
 * all kept in the URL.
 */
export function OrdersPage() {
  const { organization } = useCurrentOrganization();
  const m = useMessages(sales).orders;
  const c = useMessages(common);
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readOrderParams(searchParams);
  const invalidRange = Boolean(params.from && params.to && params.from > params.to);
  const orders = useOrders(
    organization.id,
    toOrderQuery(invalidRange ? { ...params, to: '' } : params),
  );
  const warehouses = useWarehouses(organization.id);
  const [searchInput, setSearchInput] = useState(params.search);

  const setParams = (changes: Partial<OrderParams>) =>
    setSearchParams(writeOrderParams({ ...params, page: 1, ...changes }));

  useEffect(() => {
    if (searchInput.trim() === params.search.trim()) return;
    const timeout = setTimeout(() => {
      setSearchParams(
        (current) =>
          writeOrderParams({ ...readOrderParams(current), search: searchInput, page: 1 }),
        { replace: true },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchInput, params.search, setSearchParams]);

  const clearFilters = () => {
    setSearchInput('');
    setParams({ search: '', status: '', customerId: '', warehouseId: '', from: '', to: '' });
  };

  const filtered = hasOrderFilters(params);
  const data = orders.data;
  const newOrder = (
    <Can permission="ORDERS_CREATE">
      <Link to={paths.orderNew(organization.id)} className={buttonVariants()}>
        <Plus aria-hidden="true" />
        {m.new}
      </Link>
    </Can>
  );

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`${m.title} · ${organization.name}`)}</title>
      <PageHeader title={m.title} description={m.description} actions={newOrder} />

      <search className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <FormField label={m.search}>
            {(control) => (
              <SearchInput
                {...control}
                placeholder={m.searchPlaceholder}
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            )}
          </FormField>
          <FormField label={m.status}>
            {(control) => (
              <Select
                {...control}
                value={params.status}
                onChange={(event) =>
                  setParams({ status: event.target.value as OrderParams['status'] })
                }
              >
                <option value="">{m.allStatuses}</option>
                {ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {c.orderStatus[status]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label={m.warehouse}>
            {(control) => (
              <Select
                {...control}
                value={params.warehouseId}
                onChange={(event) => setParams({ warehouseId: event.target.value })}
              >
                <option value="">{m.allWarehouses}</option>
                {warehouses.data?.warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                    {warehouse.isActive ? '' : m.archivedSuffix}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label={m.sort}>
            {(control) => (
              <Select
                {...control}
                value={params.sort}
                onChange={(event) => setParams({ sort: event.target.value as OrderParams['sort'] })}
              >
                {ORDER_SORT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {m.sortOptions[option]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label={m.from}>
            {(control) => (
              <Input
                {...control}
                type="date"
                value={params.from}
                max={params.to || undefined}
                onChange={(event) => setParams({ from: event.target.value })}
              />
            )}
          </FormField>
          <FormField
            label={m.to}
            hint={
              params.from || params.to
                ? m.daysIn({ zone: params.timeZone || browserTimeZone() })
                : undefined
            }
            error={invalidRange ? m.invalidRange : undefined}
          >
            {(control) => (
              <Input
                {...control}
                type="date"
                value={params.to}
                min={params.from || undefined}
                onChange={(event) => setParams({ to: event.target.value })}
              />
            )}
          </FormField>
        </div>
        <div className="flex min-h-8 flex-wrap items-center justify-end gap-2">
          {params.customerId && (
            <CustomerFilterChip
              customerId={params.customerId}
              onClear={() => setParams({ customerId: '' })}
            />
          )}
          {orders.isFetching && !orders.isPending && (
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

      {orders.isPending && <ListSkeleton label={m.loading} />}
      {orders.isError && (
        <ErrorState
          title={m.loadError}
          error={orders.error}
          onRetry={() => void orders.refetch()}
        />
      )}

      {data && data.pagination.totalItems === 0 && (
        <EmptyState
          icon={<ClipboardList className="size-5" aria-hidden="true" />}
          title={filtered ? m.noMatches : m.emptyTitle}
          description={filtered ? undefined : m.emptyText}
          action={
            filtered ? (
              <Button variant="secondary" onClick={clearFilters}>
                {c.actions.clearFilters}
              </Button>
            ) : (
              newOrder
            )
          }
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <Card className={cn('overflow-hidden', orders.isPlaceholderData && 'opacity-70')}>
            <OrderTable items={data.items} />
            <OrderCards items={data.items} />
          </Card>
          <PaginationBar
            page={data.pagination.page}
            pageSize={data.pagination.pageSize}
            totalPages={data.pagination.totalPages}
            totalItems={data.pagination.totalItems}
            disabled={orders.isPlaceholderData}
            onPageChange={(page) => setParams({ page })}
          />
        </>
      )}

      {data && data.items.length === 0 && data.pagination.totalItems > 0 && (
        <EmptyState
          title={m.pageEmpty}
          action={
            <Button variant="secondary" onClick={() => setParams({ page: 1 })}>
              {m.firstPage}
            </Button>
          }
        />
      )}
    </div>
  );
}

/** The customer filter (set from a customer's page), with its name. */
function CustomerFilterChip({ customerId, onClear }: { customerId: string; onClear: () => void }) {
  const { organization } = useCurrentOrganization();
  const m = useMessages(sales).orders;
  const customer = useCustomer(organization.id, customerId);
  return (
    <Badge tone="primary" className="gap-2 py-1">
      {m.customerChip({ name: customer.data?.customer.name ?? '…' })}
      <button
        type="button"
        onClick={onClear}
        className="rounded-full focus-ring"
        aria-label={m.removeCustomerFilter}
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </Badge>
  );
}

const customerName = (order: OrderListItem, none: string) =>
  order.customer ? (order.customer.companyName ?? order.customer.name) : none;

function OrderTable({ items }: { items: OrderListItem[] }) {
  const { organization } = useCurrentOrganization();
  const m = useMessages(sales).orders;
  const f = useFormat();
  return (
    <Table className="hidden @3xl:table">
      <TableHeader>
        <tr>
          <TableHead>{m.order}</TableHead>
          <TableHead>{m.customer}</TableHead>
          <TableHead>{m.warehouse}</TableHead>
          <TableHead>{m.status}</TableHead>
          <TableHead align="right">{m.lines}</TableHead>
          <TableHead align="right">{m.total}</TableHead>
          <TableHead>{m.created}</TableHead>
        </tr>
      </TableHeader>
      <TableBody>
        {items.map((order) => (
          <TableRow key={order.id}>
            <TableCell>
              <Link
                to={paths.order(organization.id, order.id)}
                className="rounded-sm font-medium focus-ring hover:underline"
              >
                {order.orderNumber}
              </Link>
            </TableCell>
            <TableCell className="max-w-56 truncate">
              {customerName(order, m.noCustomer)}
              {order.customer?.companyName && (
                <span className="block truncate text-xs text-muted-foreground">
                  {order.customer.name}
                </span>
              )}
            </TableCell>
            <TableCell className="font-mono text-xs">{order.warehouse.code}</TableCell>
            <TableCell>
              <OrderStatusBadge status={order.status} />
            </TableCell>
            <TableCell align="right">{f.number(order.itemCount)}</TableCell>
            <TableCell align="right" className="font-medium whitespace-nowrap">
              {f.money(order.total, order.currency)}
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {f.date(order.createdAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function OrderCards({ items }: { items: OrderListItem[] }) {
  const { organization } = useCurrentOrganization();
  const m = useMessages(sales).orders;
  const f = useFormat();
  return (
    <ul className="divide-y divide-border @3xl:hidden" aria-label={m.list}>
      {items.map((order) => (
        <li key={order.id} className="flex flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                to={paths.order(organization.id, order.id)}
                className="rounded-sm font-medium focus-ring hover:underline"
              >
                {order.orderNumber}
              </Link>
              <p className="truncate text-sm">{customerName(order, m.noCustomer)}</p>
            </div>
            <OrderStatusBadge status={order.status} />
          </div>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{m.warehouse}</dt>
              <dd className="font-mono text-xs">{order.warehouse.code}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{m.total}</dt>
              <dd className="font-medium tabular-nums">{f.money(order.total, order.currency)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{m.created}</dt>
              <dd>{f.date(order.createdAt)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
