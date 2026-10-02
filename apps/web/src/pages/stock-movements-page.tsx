import { STOCK_MOVEMENT_TYPES, type StockMovement } from '@app/shared';
import { ArrowLeftRight, History, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { MovementTypeBadge } from '@/components/inventory/inventory-badges';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/layout/page-state';
import { PaginationBar } from '@/components/layout/pagination-bar';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useProducts } from '@/hooks/use-catalog';
import { useStockMovements, useWarehouses } from '@/hooks/use-inventory';
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { stock } from '@/i18n/messages/stock';
import { pageTitle } from '@/lib/app-config';
import { cn } from '@/lib/cn';
import {
  hasMovementFilters,
  type MovementParams,
  movementsPath,
  readMovementParams,
  toMovementQuery,
  transferLabel,
  writeMovementParams,
} from '@/lib/inventory-params';
import { useCurrentOrganization } from '@/lib/organization-context';

const PRODUCT_OPTIONS_LIMIT = 100;

/**
 * The read-only stock ledger. Filters and the page live in the URL (so links,
 * reloads, and back/forward work) and are applied by the server.
 */
export function StockMovementsPage() {
  const { organization } = useCurrentOrganization();
  const m = useMessages(stock).movements;
  const c = useMessages(common);
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readMovementParams(searchParams);
  const invalidRange = Boolean(params.from && params.to && params.from > params.to);
  // An inverted range is shown as a field error instead of being sent.
  const movements = useStockMovements(
    organization.id,
    toMovementQuery(invalidRange ? { ...params, to: '' } : params),
  );
  const warehouses = useWarehouses(organization.id);
  const products = useProducts(organization.id, {
    sortBy: 'name',
    sortOrder: 'asc',
    page: 1,
    pageSize: PRODUCT_OPTIONS_LIMIT,
  });

  const setParams = (changes: Partial<MovementParams>) =>
    setSearchParams(writeMovementParams({ ...params, page: 1, ...changes }));
  const clearFilters = () =>
    setParams({
      warehouseId: '',
      productId: '',
      movementType: '',
      transferGroupId: '',
      from: '',
      to: '',
    });

  const productOptions = products.data?.items ?? [];
  const filtered = hasMovementFilters(params);
  const data = movements.data;

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`${m.title} · ${organization.name}`)}</title>
      <PageHeader title={m.title} description={m.description} />

      <search className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 xl:items-end">
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
        <FormField label={m.product}>
          {(control) => (
            <Select
              {...control}
              value={params.productId}
              onChange={(event) => setParams({ productId: event.target.value })}
            >
              <option value="">{m.allProducts}</option>
              {params.productId && !productOptions.some((p) => p.id === params.productId) && (
                <option value={params.productId}>{m.selectedProduct}</option>
              )}
              {productOptions.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.sku})
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label={m.type}>
          {(control) => (
            <Select
              {...control}
              value={params.movementType}
              onChange={(event) =>
                setParams({ movementType: event.target.value as MovementParams['movementType'] })
              }
            >
              <option value="">{m.allTypes}</option>
              {STOCK_MOVEMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {c.movementType[type]}
                </option>
              ))}
            </Select>
          )}
        </FormField>
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
        <FormField label={m.to} error={invalidRange ? m.invalidRange : undefined}>
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
        <FormField label={m.order}>
          {(control) => (
            <Select
              {...control}
              value={params.sortOrder}
              onChange={(event) =>
                setParams({ sortOrder: event.target.value === 'asc' ? 'asc' : 'desc' })
              }
            >
              <option value="desc">{m.newest}</option>
              <option value="asc">{m.oldest}</option>
            </Select>
          )}
        </FormField>
      </search>

      <div className="-mt-3 flex min-h-8 items-center justify-end gap-2">
        {movements.isFetching && !movements.isPending && (
          <Spinner size="sm" label={m.updating} className="text-muted-foreground" />
        )}
        {filtered && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X aria-hidden="true" />
            {c.actions.clearFilters}
          </Button>
        )}
      </div>

      {params.transferGroupId && (
        <Alert tone="info">
          {m.transferInfo({ label: transferLabel(params.transferGroupId) })}
        </Alert>
      )}

      {movements.isPending && <ListSkeleton label={m.loading} />}
      {movements.isError && (
        <ErrorState
          title={m.loadError}
          error={movements.error}
          onRetry={() => void movements.refetch()}
        />
      )}

      {data && data.pagination.totalItems === 0 && (
        <EmptyState
          icon={<History className="size-5" aria-hidden="true" />}
          title={filtered ? m.noMatches : m.emptyTitle}
          description={filtered ? undefined : m.emptyText}
          action={
            filtered ? (
              <Button variant="secondary" onClick={clearFilters}>
                {c.actions.clearFilters}
              </Button>
            ) : undefined
          }
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <Card className={cn('overflow-hidden', movements.isPlaceholderData && 'opacity-70')}>
            <MovementTable items={data.items} />
            <MovementCards items={data.items} />
          </Card>
          <PaginationBar
            page={data.pagination.page}
            pageSize={data.pagination.pageSize}
            totalPages={data.pagination.totalPages}
            totalItems={data.pagination.totalItems}
            disabled={movements.isPlaceholderData}
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

function Change({ delta }: { delta: number }) {
  const f = useFormat();
  return (
    <span
      className={cn(
        'font-medium tabular-nums',
        // The soft foreground is the readable (4.5:1) green for text; --success is for dots and icons.
        delta > 0 ? 'text-success-soft-foreground' : 'text-danger',
      )}
    >
      {f.signed(delta)}
    </span>
  );
}

/**
 * Both legs of a transfer carry the same short label, and link to a view of
 * just that transfer (its TRANSFER_OUT and TRANSFER_IN rows).
 */
function TransferLink({ movement }: { movement: StockMovement }) {
  const { organization } = useCurrentOrganization();
  const m = useMessages(stock).movements;
  const [searchParams] = useSearchParams();
  const groupId = movement.transferGroupId;
  if (!groupId) return null;
  const label = transferLabel(groupId);
  if (searchParams.get('transferGroupId') === groupId) {
    return <span className="font-mono text-xs text-muted-foreground">{m.transfer({ label })}</span>;
  }
  return (
    <Link
      to={movementsPath(organization.id, { transferGroupId: groupId })}
      className="inline-flex items-center gap-1 rounded-sm font-mono text-xs text-primary focus-ring hover:underline"
      aria-label={m.showTransfer({ label })}
    >
      <ArrowLeftRight className="size-3" aria-hidden="true" />
      {m.transfer({ label })}
    </Link>
  );
}

function MovementTable({ items }: { items: StockMovement[] }) {
  const m = useMessages(stock).movements;
  const f = useFormat();
  return (
    <Table className="hidden @5xl:table">
      <TableHeader>
        <tr>
          <TableHead className="px-3 @5xl:px-3">{m.date}</TableHead>
          <TableHead className="px-3 @5xl:px-3">{m.product}</TableHead>
          <TableHead className="px-3 @5xl:px-3">{m.warehouse}</TableHead>
          <TableHead className="px-3 @5xl:px-3">{m.type}</TableHead>
          <TableHead align="right" className="px-3 @5xl:px-3">
            {m.change}
          </TableHead>
          <TableHead align="right" className="px-3 @5xl:px-3">
            {m.before}
          </TableHead>
          <TableHead align="right" className="px-3 @5xl:px-3">
            {m.after}
          </TableHead>
          <TableHead className="px-3 @5xl:px-3">{m.by}</TableHead>
          <TableHead className="px-3 @5xl:px-3">{m.reason}</TableHead>
        </tr>
      </TableHeader>
      <TableBody>
        {items.map((movement) => (
          <TableRow key={movement.id}>
            <TableCell className="px-3 whitespace-nowrap text-muted-foreground @5xl:px-3">
              {f.dateTime(movement.createdAt)}
            </TableCell>
            <TableCell className="max-w-44 px-3">
              <span className="block truncate font-medium">{movement.product.name}</span>
              <span className="block truncate font-mono text-xs text-muted-foreground">
                {movement.product.sku}
              </span>
            </TableCell>
            <TableCell className="px-3 font-mono text-xs whitespace-nowrap @5xl:px-3">
              {movement.warehouse.code}
            </TableCell>
            <TableCell className="px-3 @5xl:px-3">
              <div className="flex flex-col items-start gap-1">
                <MovementTypeBadge type={movement.movementType} />
                <TransferLink movement={movement} />
              </div>
            </TableCell>
            <TableCell align="right" className="px-3 @5xl:px-3">
              <Change delta={movement.quantityDelta} />
            </TableCell>
            <TableCell align="right" className="px-3 text-muted-foreground @5xl:px-3">
              {f.number(movement.quantityBefore)}
            </TableCell>
            <TableCell align="right" className="px-3 @5xl:px-3">
              {f.number(movement.quantityAfter)}
            </TableCell>
            <TableCell className="max-w-28 truncate px-3">
              {movement.actor?.name ?? <span className="text-subtle-foreground">{m.system}</span>}
            </TableCell>
            <TableCell
              className="max-w-40 truncate px-3 text-muted-foreground"
              title={movement.reason ?? undefined}
            >
              {movement.reason ?? <span className="text-subtle-foreground">—</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function MovementCards({ items }: { items: StockMovement[] }) {
  const m = useMessages(stock).movements;
  const f = useFormat();
  return (
    <ul className="divide-y divide-border @5xl:hidden" aria-label={m.list}>
      {items.map((movement) => (
        <li key={movement.id} className="flex flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{movement.product.name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {movement.product.sku} · {movement.warehouse.code}
              </p>
            </div>
            <MovementTypeBadge type={movement.movementType} />
          </div>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{m.change}</dt>
              <dd>
                <Change delta={movement.quantityDelta} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{m.before}</dt>
              <dd className="tabular-nums">{f.number(movement.quantityBefore)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{m.after}</dt>
              <dd className="tabular-nums">{f.number(movement.quantityAfter)}</dd>
            </div>
          </dl>
          {movement.reason && (
            <p className="text-sm break-words text-muted-foreground">{movement.reason}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-subtle-foreground">
              {f.dateTime(movement.createdAt)} · {movement.actor?.name ?? m.system}
            </p>
            <TransferLink movement={movement} />
          </div>
        </li>
      ))}
    </ul>
  );
}
