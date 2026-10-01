import { ORDER_STATUSES, type OrderListItem } from '@app/shared';
import { ClipboardList, Plus, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/page-state';
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
import { Spinner } from '@/components/ui/spinner';
import { useWarehouses } from '@/hooks/use-inventory';
import { useCustomer, useOrders } from '@/hooks/use-sales';
import { pageTitle } from '@/lib/app-config';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { browserTimeZone } from '@/lib/local-days';
import { formatMoney } from '@/lib/money';
import { useCurrentOrganization } from '@/lib/organization-context';
import {
  hasOrderFilters,
  ORDER_SORT_OPTIONS,
  ORDER_STATUS_LABELS,
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
        New order
      </Link>
    </Can>
  );

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`Orders · ${organization.name}`)}</title>
      <PageHeader
        title="Orders"
        description="Sales orders from draft to completion. Stock is deducted when an order is processed."
        actions={newOrder}
      />

      <search className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <FormField label="Search">
            {(control) => (
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground"
                  aria-hidden="true"
                />
                <Input
                  {...control}
                  type="search"
                  placeholder="Order number or customer…"
                  className="pl-9"
                  maxLength={100}
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
              </div>
            )}
          </FormField>
          <FormField label="Status">
            {(control) => (
              <Select
                {...control}
                value={params.status}
                onChange={(event) =>
                  setParams({ status: event.target.value as OrderParams['status'] })
                }
              >
                <option value="">All statuses</option>
                {ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {ORDER_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Warehouse">
            {(control) => (
              <Select
                {...control}
                value={params.warehouseId}
                onChange={(event) => setParams({ warehouseId: event.target.value })}
              >
                <option value="">All warehouses</option>
                {warehouses.data?.warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                    {warehouse.isActive ? '' : ' (archived)'}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Sort">
            {(control) => (
              <Select
                {...control}
                value={params.sort}
                onChange={(event) => setParams({ sort: event.target.value as OrderParams['sort'] })}
              >
                {ORDER_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Created from">
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
            label="Created to"
            hint={
              params.from || params.to
                ? `Days in ${params.timeZone || browserTimeZone()}.`
                : undefined
            }
            error={invalidRange ? 'Must not be before “from”.' : undefined}
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

      {orders.isPending && <LoadingState label="Loading orders" />}
      {orders.isError && (
        <ErrorState
          title="We couldn't load orders"
          error={orders.error}
          onRetry={() => void orders.refetch()}
        />
      )}

      {data && data.pagination.totalItems === 0 && (
        <EmptyState
          icon={<ClipboardList className="size-5" aria-hidden="true" />}
          title={filtered ? 'No orders match your filters.' : 'No orders yet'}
          description={filtered ? undefined : 'Create a draft order to start selling.'}
          action={
            filtered ? (
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
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
          title="This page is empty."
          action={
            <Button variant="secondary" onClick={() => setParams({ page: 1 })}>
              Go to the first page
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
  const customer = useCustomer(organization.id, customerId);
  return (
    <Badge tone="primary" className="gap-2 py-1">
      Customer: {customer.data?.customer.name ?? '…'}
      <button
        type="button"
        onClick={onClear}
        className="rounded-full focus-ring"
        aria-label="Remove the customer filter"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </Badge>
  );
}

const customerName = (order: OrderListItem) =>
  order.customer ? (order.customer.companyName ?? order.customer.name) : 'No customer';

function OrderTable({ items }: { items: OrderListItem[] }) {
  const { organization } = useCurrentOrganization();
  return (
    <table className="hidden w-full text-sm lg:table">
      <thead className="border-b border-border bg-surface-muted/60 text-left text-xs font-medium text-muted-foreground">
        <tr>
          <th scope="col" className="px-4 py-2.5 font-medium">
            Order
          </th>
          <th scope="col" className="px-4 py-2.5 font-medium">
            Customer
          </th>
          <th scope="col" className="px-4 py-2.5 font-medium">
            Warehouse
          </th>
          <th scope="col" className="px-4 py-2.5 font-medium">
            Status
          </th>
          <th scope="col" className="px-4 py-2.5 text-right font-medium">
            Lines
          </th>
          <th scope="col" className="px-4 py-2.5 text-right font-medium">
            Total
          </th>
          <th scope="col" className="px-4 py-2.5 font-medium">
            Created
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {items.map((order) => (
          <tr key={order.id}>
            <td className="px-4 py-3">
              <Link
                to={paths.order(organization.id, order.id)}
                className="rounded-sm font-medium focus-ring hover:underline"
              >
                {order.orderNumber}
              </Link>
            </td>
            <td className="max-w-56 truncate px-4 py-3">
              {customerName(order)}
              {order.customer?.companyName && (
                <span className="block truncate text-xs text-muted-foreground">
                  {order.customer.name}
                </span>
              )}
            </td>
            <td className="px-4 py-3 font-mono text-xs">{order.warehouse.code}</td>
            <td className="px-4 py-3">
              <OrderStatusBadge status={order.status} />
            </td>
            <td className="px-4 py-3 text-right tabular-nums">{order.itemCount}</td>
            <td className="px-4 py-3 text-right font-medium tabular-nums">
              {formatMoney(order.total)}
            </td>
            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
              {formatDate(order.createdAt)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OrderCards({ items }: { items: OrderListItem[] }) {
  const { organization } = useCurrentOrganization();
  return (
    <ul className="divide-y divide-border lg:hidden" aria-label="Orders">
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
              <p className="truncate text-sm">{customerName(order)}</p>
            </div>
            <OrderStatusBadge status={order.status} />
          </div>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Warehouse</dt>
              <dd className="font-mono text-xs">{order.warehouse.code}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Total</dt>
              <dd className="font-medium tabular-nums">{formatMoney(order.total)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Created</dt>
              <dd>{formatDate(order.createdAt)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
