import type { InventoryItem } from '@app/shared';
import {
  ArrowLeftRight,
  ClipboardCheck,
  History,
  MinusCircle,
  PackageOpen,
  PackagePlus,
  Search,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { StockStatusBadge } from '@/components/inventory/inventory-badges';
import {
  StockOperationDialog,
  type StockOperationStart,
} from '@/components/inventory/stock-operation-dialog';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/layout/page-state';
import { PaginationBar } from '@/components/layout/pagination-bar';
import { Can } from '@/components/organization/can';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
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
import { useInventory, useWarehouses } from '@/hooks/use-inventory';
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { stock } from '@/i18n/messages/stock';
import { pageTitle } from '@/lib/app-config';
import { cn } from '@/lib/cn';
import {
  hasInventoryFilters,
  INVENTORY_SORT_OPTIONS,
  type InventoryParams,
  movementsPath,
  readInventoryParams,
  toInventoryQuery,
  writeInventoryParams,
} from '@/lib/inventory-params';
import { useCurrentOrganization } from '@/lib/organization-context';
import type { StockOperationKind } from '@/lib/stock-form';
import { paths } from '@/routes/paths';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Stock per product and warehouse, with server-side search, filters, sorting,
 * and pagination kept in the URL, and the stock operations the role allows.
 */
export function InventoryPage() {
  const { organization } = useCurrentOrganization();
  const m = useMessages(stock).inventory;
  const c = useMessages(common);
  const f = useFormat();
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readInventoryParams(searchParams);
  const inventory = useInventory(organization.id, toInventoryQuery(params));
  const warehouses = useWarehouses(organization.id);
  const [searchInput, setSearchInput] = useState(params.search);
  const [operation, setOperation] = useState<StockOperationStart | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filter, sort, and page changes are history entries, so back/forward steps through them.
  const setParams = (changes: Partial<InventoryParams>) =>
    setSearchParams(writeInventoryParams({ ...params, page: 1, ...changes }));

  useEffect(() => {
    if (searchInput.trim() === params.search.trim()) return;
    const timeout = setTimeout(() => {
      setSearchParams(
        (current) =>
          writeInventoryParams({ ...readInventoryParams(current), search: searchInput, page: 1 }),
        { replace: true },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchInput, params.search, setSearchParams]);

  const clearFilters = () => {
    setSearchInput('');
    setSearchParams(
      writeInventoryParams({ ...params, search: '', warehouseId: '', status: '', page: 1 }),
      {
        replace: true,
      },
    );
  };

  const open = (start: StockOperationStart) => {
    setNotice(null);
    setOperation(start);
  };

  const filtered = hasInventoryFilters(params);
  const data = inventory.data;

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`${m.title} · ${organization.name}`)}</title>
      <PageHeader
        title={m.title}
        description={m.description}
        actions={
          <>
            <Can permission="INVENTORY_RECEIVE">
              <Button onClick={() => open({ kind: 'receive' })}>
                <PackagePlus aria-hidden="true" />
                {m.receive}
              </Button>
            </Can>
            <Can permission="INVENTORY_TRANSFER">
              <Button variant="secondary" onClick={() => open({ kind: 'transfer' })}>
                <ArrowLeftRight aria-hidden="true" />
                {m.transfer}
              </Button>
            </Can>
          </>
        }
      />

      <search className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput
          wrapperClassName="lg:max-w-sm lg:flex-1"

          aria-label={m.search}
          placeholder={m.searchPlaceholder}
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex lg:flex-none">
          <Select
            aria-label={m.warehouse}
            wrapperClassName="lg:w-48"
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
          <Select
            aria-label={m.stockStatus}
            wrapperClassName="lg:w-40"
            value={params.status}
            onChange={(event) =>
              setParams({ status: event.target.value as InventoryParams['status'] })
            }
          >
            <option value="">{m.allLevels}</option>
            {Object.entries(c.stockStatus).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            aria-label={m.sort}
            wrapperClassName="lg:w-52"
            value={params.sort}
            onChange={(event) => setParams({ sort: event.target.value as InventoryParams['sort'] })}
          >
            {INVENTORY_SORT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {m.sortOptions[option]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2 lg:ml-auto">
          {inventory.isFetching && !inventory.isPending && (
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

      {inventory.isPending && <ListSkeleton label={m.loading} />}
      {inventory.isError && (
        <ErrorState
          title={m.loadError}
          error={inventory.error}
          onRetry={() => void inventory.refetch()}
        />
      )}

      {data && data.pagination.totalItems === 0 && !filtered && (
        <EmptyState
          icon={<PackageOpen className="size-5" aria-hidden="true" />}
          title={m.emptyTitle}
          description={m.emptyText}
          action={
            <Can permission="INVENTORY_RECEIVE">
              <Button onClick={() => open({ kind: 'receive' })}>
                <PackagePlus aria-hidden="true" />
                {m.receive}
              </Button>
            </Can>
          }
        />
      )}
      {data && data.pagination.totalItems === 0 && filtered && (
        <EmptyState
          icon={<Search className="size-5" aria-hidden="true" />}
          title={m.noMatches}
          action={
            <Button variant="secondary" onClick={clearFilters}>
              {c.actions.clearFilters}
            </Button>
          }
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <Card className={cn('overflow-hidden', inventory.isPlaceholderData && 'opacity-70')}>
            <Table className="hidden @5xl:table">
              <TableHeader>
                <tr>
                  <TableHead>{m.product}</TableHead>
                  <TableHead>{m.sku}</TableHead>
                  <TableHead>{m.warehouse}</TableHead>
                  <TableHead align="right">{m.quantity}</TableHead>
                  <TableHead align="right">{m.minimum}</TableHead>
                  <TableHead>{m.status}</TableHead>
                  <TableHead>
                    <span className="sr-only">{m.actions}</span>
                  </TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-56">
                      <Link
                        to={paths.product(organization.id, item.product.id)}
                        className="block truncate rounded-sm font-medium text-foreground focus-ring hover:underline"
                      >
                        {item.product.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {item.product.sku}
                    </TableCell>
                    <TableCell className="max-w-44 truncate whitespace-nowrap">
                      {item.warehouse.name}{' '}
                      <span className="font-mono text-xs text-muted-foreground">
                        {item.warehouse.code}
                      </span>
                    </TableCell>
                    <TableCell align="right" className="font-medium">
                      {f.number(item.quantity)}
                    </TableCell>
                    <TableCell align="right" className="text-muted-foreground">
                      {f.number(item.minimumStock)}
                    </TableCell>
                    <TableCell>
                      <StockStatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="py-2">
                      <InventoryActions item={item} onOpen={open} compact />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <ul className="divide-y divide-border @5xl:hidden" aria-label={m.list}>
              {data.items.map((item) => (
                <li key={item.id} className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={paths.product(organization.id, item.product.id)}
                        className="block truncate rounded-sm font-medium focus-ring hover:underline"
                      >
                        {item.product.name}
                      </Link>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {item.product.sku} · {item.warehouse.code}
                      </p>
                    </div>
                    <StockStatusBadge status={item.status} />
                  </div>
                  <dl className="grid grid-cols-3 gap-3 text-sm">
                    <div className="min-w-0">
                      <dt className="text-xs text-muted-foreground">{m.warehouse}</dt>
                      <dd className="truncate">{item.warehouse.name}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{m.quantity}</dt>
                      <dd className="font-medium tabular-nums">{f.number(item.quantity)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{m.minimum}</dt>
                      <dd className="tabular-nums">{f.number(item.minimumStock)}</dd>
                    </div>
                  </dl>
                  <InventoryActions item={item} onOpen={open} />
                </li>
              ))}
            </ul>
          </Card>
          <PaginationBar
            page={data.pagination.page}
            pageSize={data.pagination.pageSize}
            totalPages={data.pagination.totalPages}
            totalItems={data.pagination.totalItems}
            disabled={inventory.isPlaceholderData}
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

      <StockOperationDialog
        start={operation}
        onClose={() => setOperation(null)}
        onDone={(message) => {
          setOperation(null);
          setNotice(message);
        }}
      />
    </div>
  );
}

const OPERATION_BUTTONS: {
  kind: StockOperationKind;
  permission: 'INVENTORY_RECEIVE' | 'INVENTORY_ISSUE' | 'INVENTORY_ADJUST' | 'INVENTORY_TRANSFER';
  icon: typeof PackagePlus;
}[] = [
  { kind: 'receive', permission: 'INVENTORY_RECEIVE', icon: PackagePlus },
  { kind: 'issue', permission: 'INVENTORY_ISSUE', icon: MinusCircle },
  { kind: 'damage', permission: 'INVENTORY_ISSUE', icon: TriangleAlert },
  { kind: 'adjust', permission: 'INVENTORY_ADJUST', icon: ClipboardCheck },
  { kind: 'transfer', permission: 'INVENTORY_TRANSFER', icon: ArrowLeftRight },
];

/**
 * The operations the viewer's role allows (UX only — the API checks again).
 * Archived products and warehouses get an explanation instead of actions.
 */
function InventoryActions({
  item,
  onOpen,
  compact = false,
}: {
  item: InventoryItem;
  onOpen: (start: StockOperationStart) => void;
  /** Icon-only buttons (with accessible names and tooltips) for the desktop table. */
  compact?: boolean;
}) {
  const { organization, can } = useCurrentOrganization();
  const m = useMessages(stock).inventory;
  const blocked =
    item.product.status !== 'ACTIVE'
      ? m.productArchived
      : !item.warehouse.isActive
        ? m.warehouseArchived
        : null;
  const empty = item.quantity === 0;

  return (
    <div className="flex flex-wrap items-center gap-1 @5xl:flex-nowrap @5xl:justify-end">
      {blocked ? (
        <span className="px-2 text-xs text-muted-foreground">{blocked}</span>
      ) : (
        OPERATION_BUTTONS.filter(({ permission }) => can(permission)).map(
          ({ kind, icon: Icon }) => {
            const label = m.operation[kind];
            // Nothing to remove or move out of an empty location.
            const nothingToMove = empty && kind !== 'receive' && kind !== 'adjust';
            return (
              <Button
                key={kind}
                variant="ghost"
                size={compact ? 'icon-sm' : 'sm'}
                disabled={nothingToMove}
                title={nothingToMove ? m.noStockHere : compact ? label : undefined}
                aria-label={m.operationNamed({
                  label,
                  product: item.product.name,
                  warehouse: item.warehouse.code,
                })}
                onClick={() =>
                  onOpen({
                    kind,
                    warehouseId: item.warehouse.id,
                    product: {
                      id: item.product.id,
                      name: item.product.name,
                      sku: item.product.sku,
                    },
                  })
                }
              >
                <Icon aria-hidden="true" />
                {!compact && label}
              </Button>
            );
          },
        )
      )}
      <Link
        to={movementsPath(organization.id, {
          warehouseId: item.warehouse.id,
          productId: item.product.id,
        })}
        className={buttonVariants({
          variant: 'ghost',
          size: compact ? 'icon-sm' : 'sm',
        })}
        aria-label={m.historyNamed({ product: item.product.name, warehouse: item.warehouse.code })}
        title={compact ? m.history : undefined}
      >
        <History aria-hidden="true" />
        {!compact && m.history}
      </Link>
    </div>
  );
}
