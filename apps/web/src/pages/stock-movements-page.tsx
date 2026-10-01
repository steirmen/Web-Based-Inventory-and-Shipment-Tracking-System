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
import { pageTitle } from '@/lib/app-config';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import {
  formatDelta,
  hasMovementFilters,
  MOVEMENT_TYPE_LABELS,
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
      <title>{pageTitle(`Stock movements · ${organization.name}`)}</title>
      <PageHeader
        title="Stock movements"
        description="A permanent record of every stock change. Entries can't be edited or deleted; mistakes are corrected with a new movement."
      />

      <search className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 xl:items-end">
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
        <FormField label="Product">
          {(control) => (
            <Select
              {...control}
              value={params.productId}
              onChange={(event) => setParams({ productId: event.target.value })}
            >
              <option value="">All products</option>
              {params.productId && !productOptions.some((p) => p.id === params.productId) && (
                <option value={params.productId}>Selected product</option>
              )}
              {productOptions.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.sku})
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Type">
          {(control) => (
            <Select
              {...control}
              value={params.movementType}
              onChange={(event) =>
                setParams({ movementType: event.target.value as MovementParams['movementType'] })
              }
            >
              <option value="">All types</option>
              {STOCK_MOVEMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {MOVEMENT_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="From">
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
        <FormField label="To" error={invalidRange ? 'Must not be before “From”.' : undefined}>
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
        <FormField label="Order">
          {(control) => (
            <Select
              {...control}
              value={params.sortOrder}
              onChange={(event) =>
                setParams({ sortOrder: event.target.value === 'asc' ? 'asc' : 'desc' })
              }
            >
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </Select>
          )}
        </FormField>
      </search>

      <div className="-mt-3 flex min-h-8 items-center justify-end gap-2">
        {movements.isFetching && !movements.isPending && (
          <Spinner size="sm" label="Updating results" className="text-muted-foreground" />
        )}
        {filtered && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X aria-hidden="true" />
            Clear filters
          </Button>
        )}
      </div>

      {params.transferGroupId && (
        <Alert tone="info">
          Showing the two movements of transfer {transferLabel(params.transferGroupId)}: stock
          leaving the source warehouse and arriving in the destination.
        </Alert>
      )}

      {movements.isPending && <ListSkeleton label="Loading stock movements" />}
      {movements.isError && (
        <ErrorState
          title="We couldn't load stock movements"
          error={movements.error}
          onRetry={() => void movements.refetch()}
        />
      )}

      {data && data.pagination.totalItems === 0 && (
        <EmptyState
          icon={<History className="size-5" aria-hidden="true" />}
          title={filtered ? 'No movements match your filters.' : 'No stock movements yet'}
          description={
            filtered ? undefined : 'Receiving, issuing, or moving stock records a movement here.'
          }
          action={
            filtered ? (
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
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

function Change({ delta }: { delta: number }) {
  return (
    <span
      className={cn(
        'font-medium tabular-nums',
        // The soft foreground is the readable (4.5:1) green for text; --success is for dots and icons.
        delta > 0 ? 'text-success-soft-foreground' : 'text-danger',
      )}
    >
      {formatDelta(delta)}
    </span>
  );
}

/**
 * Both legs of a transfer carry the same short label, and link to a view of
 * just that transfer (its TRANSFER_OUT and TRANSFER_IN rows).
 */
function TransferLink({ movement }: { movement: StockMovement }) {
  const { organization } = useCurrentOrganization();
  const [searchParams] = useSearchParams();
  const groupId = movement.transferGroupId;
  if (!groupId) return null;
  const label = transferLabel(groupId);
  if (searchParams.get('transferGroupId') === groupId) {
    return <span className="font-mono text-xs text-muted-foreground">Transfer {label}</span>;
  }
  return (
    <Link
      to={movementsPath(organization.id, { transferGroupId: groupId })}
      className="inline-flex items-center gap-1 rounded-sm font-mono text-xs text-primary focus-ring hover:underline"
      aria-label={`Show both movements of transfer ${label}`}
    >
      <ArrowLeftRight className="size-3" aria-hidden="true" />
      Transfer {label}
    </Link>
  );
}

function MovementTable({ items }: { items: StockMovement[] }) {
  return (
    <Table className="hidden @5xl:table">
      <TableHeader>
        <tr>
          <TableHead className="px-3 @5xl:px-3">Date</TableHead>
          <TableHead className="px-3 @5xl:px-3">Product</TableHead>
          <TableHead className="px-3 @5xl:px-3">Warehouse</TableHead>
          <TableHead className="px-3 @5xl:px-3">Type</TableHead>
          <TableHead align="right" className="px-3 @5xl:px-3">
            Change
          </TableHead>
          <TableHead align="right" className="px-3 @5xl:px-3">
            Before
          </TableHead>
          <TableHead align="right" className="px-3 @5xl:px-3">
            After
          </TableHead>
          <TableHead className="px-3 @5xl:px-3">By</TableHead>
          <TableHead className="px-3 @5xl:px-3">Reason</TableHead>
        </tr>
      </TableHeader>
      <TableBody>
        {items.map((movement) => (
          <TableRow key={movement.id}>
            <TableCell className="px-3 whitespace-nowrap text-muted-foreground @5xl:px-3">
              {formatDateTime(movement.createdAt)}
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
              {movement.quantityBefore.toLocaleString()}
            </TableCell>
            <TableCell align="right" className="px-3 @5xl:px-3">
              {movement.quantityAfter.toLocaleString()}
            </TableCell>
            <TableCell className="max-w-28 truncate px-3">
              {movement.actor?.name ?? <span className="text-subtle-foreground">System</span>}
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
  return (
    <ul className="divide-y divide-border @5xl:hidden" aria-label="Stock movements">
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
              <dt className="text-xs text-muted-foreground">Change</dt>
              <dd>
                <Change delta={movement.quantityDelta} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Before</dt>
              <dd className="tabular-nums">{movement.quantityBefore.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">After</dt>
              <dd className="tabular-nums">{movement.quantityAfter.toLocaleString()}</dd>
            </div>
          </dl>
          {movement.reason && (
            <p className="text-sm break-words text-muted-foreground">{movement.reason}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-subtle-foreground">
              {formatDateTime(movement.createdAt)} · {movement.actor?.name ?? 'System'}
            </p>
            <TransferLink movement={movement} />
          </div>
        </li>
      ))}
    </ul>
  );
}
