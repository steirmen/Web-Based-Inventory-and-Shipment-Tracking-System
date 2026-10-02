import type { DashboardKpis, DashboardWarehouseSummary, StockStatus } from '@app/shared';
import { ArrowRight, Boxes, Warehouse } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/layout/page-state';
import { Can } from '@/components/organization/can';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { percentOf } from '@/lib/chart-math';
import { cn } from '@/lib/cn';
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { insights } from '@/i18n/messages/insights';
import { inventoryStatusPath } from '@/lib/dashboard-params';
import { paths } from '@/routes/paths';

const TILES: {
  status: StockStatus;
  count: (kpis: DashboardKpis) => number;
  tone: string;
  bar: string;
}[] = [
  {
    status: 'IN_STOCK',
    count: (kpis) => kpis.inStockItems,
    tone: 'border-border',
    bar: 'bg-success',
  },
  {
    status: 'LOW_STOCK',
    count: (kpis) => kpis.lowStockItems,
    tone: 'border-warning-border bg-warning-soft',
    bar: 'bg-warning',
  },
  {
    status: 'OUT_OF_STOCK',
    count: (kpis) => kpis.outOfStockItems,
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
  const m = useMessages(insights).inventory;
  const c = useMessages(common);
  const f = useFormat();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.title}</CardTitle>
        <CardDescription>
          {m.description({ count: f.number(kpis.inventoryUnits), units: kpis.inventoryUnits })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {total === 0 ? (
          <EmptyState
            icon={<Boxes className="size-5" aria-hidden="true" />}
            title={m.empty}
            description={m.emptyText}
            action={
              <Link
                to={paths.inventory(organizationId)}
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
              >
                {m.goToInventory}
              </Link>
            }
          />
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label={m.byStatus}>
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
                        {c.stockStatus[tile.status]}
                      </span>
                      <span className="text-2xl leading-8 font-semibold text-foreground tabular-nums">
                        {f.number(count)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {m.hints[tile.status]}
                        <span className="sr-only">{m.viewInInventory}</span>
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
  const m = useMessages(insights).warehouses;
  const f = useFormat();

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <CardTitle>{m.title}</CardTitle>
          <CardDescription>
            {m.description}
            {archived > 0 && m.archivedHidden({ count: f.number(archived) })}.
          </CardDescription>
        </div>
        <Link
          to={paths.warehouses(organizationId)}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'self-start')}
        >
          {m.all}
          <ArrowRight aria-hidden="true" />
        </Link>
      </CardHeader>
      <CardContent>
        {active.length === 0 ? (
          <EmptyState
            icon={<Warehouse className="size-5" aria-hidden="true" />}
            title={m.empty}
            description={m.emptyText}
            action={
              <Can permission="WAREHOUSES_CREATE">
                <Link
                  to={paths.warehouses(organizationId)}
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  {m.add}
                </Link>
              </Can>
            }
          />
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[22rem] text-sm">
              <caption className="sr-only">{m.caption}</caption>
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {m.warehouse}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {m.units}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {m.low}
                  </th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">
                    {m.out}
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
                      {f.number(warehouse.totalUnits)}
                    </td>
                    <td
                      className={cn(
                        'px-3 py-2 text-right tabular-nums',
                        warehouse.lowStockItems > 0 && 'font-semibold text-foreground',
                      )}
                    >
                      {f.number(warehouse.lowStockItems)}
                    </td>
                    <td
                      className={cn(
                        'py-2 pl-3 text-right tabular-nums',
                        warehouse.outOfStockItems > 0 && 'font-semibold text-foreground',
                      )}
                    >
                      {f.number(warehouse.outOfStockItems)}
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
