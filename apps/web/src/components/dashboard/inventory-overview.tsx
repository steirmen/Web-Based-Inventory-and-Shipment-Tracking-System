import type { DashboardKpis, DashboardWarehouseSummary, StockStatus } from '@app/shared';
import { ArrowRight, Boxes, Warehouse } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/layout/page-state';
import { Can } from '@/components/organization/can';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { percentOf } from '@/lib/chart-math';
import { cn } from '@/lib/cn';
import { formatCount, inventoryStatusPath } from '@/lib/dashboard-params';
import { STOCK_STATUS_LABELS } from '@/lib/inventory-params';
import { paths } from '@/routes/paths';

const TILES: {
  status: StockStatus;
  count: (kpis: DashboardKpis) => number;
  hint: string;
  tone: string;
  bar: string;
}[] = [
  {
    status: 'IN_STOCK',
    count: (kpis) => kpis.inStockItems,
    hint: 'Above the reorder level',
    tone: 'border-border',
    bar: 'bg-success',
  },
  {
    status: 'LOW_STOCK',
    count: (kpis) => kpis.lowStockItems,
    hint: 'At or below the reorder level',
    tone: 'border-warning-border bg-warning-soft',
    bar: 'bg-warning',
  },
  {
    status: 'OUT_OF_STOCK',
    count: (kpis) => kpis.outOfStockItems,
    hint: 'None on hand',
    tone: 'border-danger-border bg-danger-soft',
    bar: 'bg-danger',
  },
];

/**
 * Stock health with the Phase 6 statuses, counted per product and warehouse
 * (active products, active warehouses). Low and out-of-stock tiles stand out
 * when they are not zero and link to the inventory list filtered by status.
 */
export function InventoryOverview({
  organizationId,
  kpis,
}: {
  organizationId: string;
  kpis: DashboardKpis;
}) {
  const total = kpis.inStockItems + kpis.lowStockItems + kpis.outOfStockItems;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventory</CardTitle>
        <CardDescription>
          {formatCount(kpis.inventoryUnits)} {kpis.inventoryUnits === 1 ? 'unit' : 'units'} on hand.
          Stock items are counted per product and warehouse.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {total === 0 ? (
          <EmptyState
            icon={<Boxes className="size-5" aria-hidden="true" />}
            title="No stock recorded yet."
            description="Receive stock into a warehouse to see stock levels here."
            action={
              <Link
                to={paths.inventory(organizationId)}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                Go to inventory
              </Link>
            }
          />
        ) : (
          <>
            <ul
              className="grid grid-cols-1 gap-3 sm:grid-cols-3"
              aria-label="Stock items by status"
            >
              {TILES.map((tile) => {
                const count = tile.count(kpis);
                const needsAction = tile.status !== 'IN_STOCK' && count > 0;
                return (
                  <li key={tile.status}>
                    <Link
                      to={inventoryStatusPath(organizationId, tile.status)}
                      className={cn(
                        'flex h-full flex-col gap-1 rounded-control border p-3 focus-ring transition-colors hover:border-border-strong',
                        needsAction ? tile.tone : 'border-border',
                      )}
                    >
                      <span className="text-sm font-medium text-foreground">
                        {STOCK_STATUS_LABELS[tile.status]}
                      </span>
                      <span className="text-2xl leading-8 font-semibold text-foreground tabular-nums">
                        {formatCount(count)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {tile.hint}
                        <span className="sr-only">. View in inventory</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div
              className="flex h-2 w-full overflow-hidden rounded-full bg-surface-muted"
              aria-hidden="true"
            >
              {TILES.map((tile) => (
                <span
                  key={tile.status}
                  className={tile.bar}
                  style={{ width: `${percentOf(tile.count(kpis), total)}%` }}
                />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Active warehouses with their stock summary, linking to each warehouse's detail. */
export function WarehouseOverview({
  organizationId,
  warehouses,
}: {
  organizationId: string;
  warehouses: DashboardWarehouseSummary[];
}) {
  const active = warehouses.filter((warehouse) => warehouse.isActive);
  const archived = warehouses.length - active.length;

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Warehouses</CardTitle>
          <CardDescription>
            Stock per active warehouse
            {archived > 0 && ` (${formatCount(archived)} archived not shown)`}.
          </CardDescription>
        </div>
        <Link
          to={paths.warehouses(organizationId)}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'self-start')}
        >
          All warehouses
          <ArrowRight aria-hidden="true" />
        </Link>
      </CardHeader>
      <CardContent>
        {active.length === 0 ? (
          <EmptyState
            icon={<Warehouse className="size-5" aria-hidden="true" />}
            title="No active warehouses."
            description="Add a warehouse to start tracking stock."
            action={
              <Can permission="WAREHOUSES_CREATE">
                <Link
                  to={paths.warehouses(organizationId)}
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  Add warehouse
                </Link>
              </Can>
            }
          />
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[22rem] text-sm">
              <caption className="sr-only">Stock per active warehouse</caption>
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Warehouse
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Units
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Low
                  </th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">
                    Out
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {active.map((warehouse) => (
                  <tr key={warehouse.id}>
                    <th scope="row" className="py-2 pr-3 text-left font-normal">
                      <Link
                        to={paths.warehouse(organizationId, warehouse.id)}
                        className="rounded-sm font-medium text-foreground focus-ring hover:underline"
                      >
                        {warehouse.name}
                      </Link>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {warehouse.code}
                      </span>
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCount(warehouse.totalUnits)}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right tabular-nums',
                        warehouse.lowStockItems > 0 && 'font-semibold text-foreground',
                      )}
                    >
                      {formatCount(warehouse.lowStockItems)}
                    </td>
                    <td
                      className={cn(
                        'py-2 pl-3 text-right tabular-nums',
                        warehouse.outOfStockItems > 0 && 'font-semibold text-foreground',
                      )}
                    >
                      {formatCount(warehouse.outOfStockItems)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
