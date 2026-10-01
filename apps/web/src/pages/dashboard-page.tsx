import type { DashboardSummaryResponse } from '@app/shared';
import {
  Boxes,
  CalendarRange,
  Package,
  ShoppingCart,
  TriangleAlert,
  Users,
  Wallet,
} from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChangeIndicator, KpiCard } from '@/components/dashboard/kpi-card';
import { InventoryOverview, WarehouseOverview } from '@/components/dashboard/inventory-overview';
import { OrderStatusChart } from '@/components/dashboard/order-status-chart';
import { RangePicker } from '@/components/dashboard/range-picker';
import { SalesChart } from '@/components/dashboard/sales-chart';
import { RecentOrders, TopProducts } from '@/components/dashboard/top-products';
import { ErrorState } from '@/components/layout/page-state';
import { PageHeader } from '@/components/layout/page-header';
import { Can } from '@/components/organization/can';
import { Alert } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardSummary } from '@/hooks/use-dashboard';
import { pageTitle } from '@/lib/app-config';
import { cn } from '@/lib/cn';
import {
  browserTimeZone,
  type DashboardParams,
  formatCount,
  formatDayRange,
  inventoryStatusPath,
  ordersInPeriodPath,
  readDashboardParams,
  toDashboardQuery,
  writeDashboardParams,
} from '@/lib/dashboard-params';
import { useFlashNotice } from '@/lib/flash-notice';
import { formatMoney } from '@/lib/money';
import { useCurrentOrganization } from '@/lib/organization-context';
import { salesReportPath } from '@/lib/report-params';
import { paths } from '@/routes/paths';

/**
 * The workspace overview (`/org/:organizationId`): real, read-only numbers
 * from the dashboard API for the date range in the URL. Every section links
 * to the page with the details. The layout is fixed on purpose: there is no
 * widget configuration.
 */
export function DashboardPage() {
  const { organization } = useCurrentOrganization();
  const [searchParams, setSearchParams] = useSearchParams();
  // E.g. "Workspace created." after onboarding; shown once.
  const [notice, setNotice] = useFlashNotice();

  const params = readDashboardParams(searchParams);
  const paramsKey = writeDashboardParams(params).toString();
  const timeZone = useMemo(() => browserTimeZone(), []);
  const query = useMemo(
    () => toDashboardQuery(readDashboardParams(new URLSearchParams(paramsKey)), timeZone),
    [paramsKey, timeZone],
  );
  const summary = useDashboardSummary(organization.id, query);
  const data = summary.data;

  const changeRange = (next: DashboardParams) => setSearchParams(writeDashboardParams(next));

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`Overview · ${organization.name}`)}</title>
      <PageHeader
        eyebrow={organization.name}
        title="Overview"
        description="Sales, orders, customers, and stock of this workspace at a glance."
        actions={
          <RangePicker
            key={paramsKey}
            value={params}
            period={data?.period}
            onChange={changeRange}
          />
        }
      />

      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {summary.isError && !data ? (
        <ErrorState
          title="We couldn't load the dashboard"
          error={summary.error}
          onRetry={() => void summary.refetch()}
        />
      ) : !data ? (
        <DashboardSkeleton />
      ) : (
        <div
          className={cn(
            'flex flex-col gap-6 transition-opacity',
            summary.isPlaceholderData && 'opacity-60',
          )}
          aria-busy={summary.isPlaceholderData || undefined}
        >
          <PeriodCaption data={data} updating={summary.isPlaceholderData} />
          {summary.isError && (
            <ErrorState
              title="We couldn't refresh the dashboard"
              error={summary.error}
              onRetry={() => void summary.refetch()}
            />
          )}
          <DashboardContent organizationId={organization.id} data={data} />
        </div>
      )}
    </div>
  );
}

function PeriodCaption({ data, updating }: { data: DashboardSummaryResponse; updating: boolean }) {
  const { period, comparisonPeriod } = data;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      <CalendarRange className="size-4 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-medium text-foreground">
          {formatDayRange(period.from, period.to)}
        </span>{' '}
        compared with {formatDayRange(comparisonPeriod.from, comparisonPeriod.to)}
      </span>
      <span className="text-xs">({period.timeZone})</span>
      <span className="sr-only" aria-live="polite">
        {updating ? 'Updating the dashboard' : ''}
      </span>
    </p>
  );
}

function DashboardContent({
  organizationId,
  data,
}: {
  organizationId: string;
  data: DashboardSummaryResponse;
}) {
  const { kpis, period, comparisonPeriod } = data;
  const comparison = formatDayRange(comparisonPeriod.from, comparisonPeriod.to);
  const isNewWorkspace =
    kpis.activeProducts + kpis.archivedProducts === 0 &&
    kpis.activeCustomers + kpis.archivedCustomers === 0 &&
    kpis.orders.current === 0;

  return (
    <>
      {isNewWorkspace && <GetStarted organizationId={organizationId} />}

      <section aria-labelledby="dashboard-kpis" className="flex flex-col gap-3">
        <h2 id="dashboard-kpis" className="sr-only">
          Key figures
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard label="Total sales" value={formatMoney(kpis.sales.current)} icon={<Wallet />}>
            <ChangeIndicator metric={kpis.sales} kind="money" comparison={comparison} />
          </KpiCard>
          <KpiCard label="Orders" value={formatCount(kpis.orders.current)} icon={<ShoppingCart />}>
            <ChangeIndicator metric={kpis.orders} kind="count" comparison={comparison} />
          </KpiCard>
          <KpiCard label="Customers" value={formatCount(kpis.activeCustomers)} icon={<Users />}>
            <p>Active · {formatCount(kpis.newCustomers.current)} new in this period</p>
          </KpiCard>
          <KpiCard label="Products" value={formatCount(kpis.activeProducts)} icon={<Package />}>
            <p>Active · {formatCount(kpis.archivedProducts)} archived</p>
          </KpiCard>
          <KpiCard
            label="Inventory units"
            value={
              <>
                {formatCount(kpis.inventoryUnits)}{' '}
                <span className="text-base font-medium text-muted-foreground">units</span>
              </>
            }
            icon={<Boxes />}
          >
            <p>
              On hand in {formatCount(kpis.activeWarehouses)} active{' '}
              {kpis.activeWarehouses === 1 ? 'warehouse' : 'warehouses'}
            </p>
          </KpiCard>
          <KpiCard
            label="Low stock"
            value={formatCount(kpis.lowStockItems)}
            icon={<TriangleAlert />}
            emphasis={kpis.lowStockItems + kpis.outOfStockItems > 0}
          >
            <p className="flex flex-wrap gap-x-2">
              <span>{formatCount(kpis.outOfStockItems)} out of stock</span>
              <Link
                to={inventoryStatusPath(organizationId, 'LOW_STOCK')}
                className="rounded-sm font-medium text-primary focus-ring hover:underline"
              >
                View low stock
              </Link>
            </p>
          </KpiCard>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <SalesChart
            organizationId={organizationId}
            series={data.timeSeries}
            totalRevenue={kpis.sales.current}
            totalOrders={kpis.orders.current}
          />
        </div>
        <OrderStatusChart
          organizationId={organizationId}
          statuses={data.orderStatus}
          period={period}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InventoryOverview organizationId={organizationId} kpis={kpis} />
        <WarehouseOverview organizationId={organizationId} warehouses={data.warehouses} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TopProducts
          organizationId={organizationId}
          products={data.topProducts}
          salesReportHref={salesReportPath(organizationId, {
            range: period.range,
            from: period.range === 'CUSTOM' ? period.from : '',
            to: period.range === 'CUSTOM' ? period.to : '',
          })}
        />
        <RecentOrders
          organizationId={organizationId}
          orders={data.recentOrders}
          allOrdersHref={ordersInPeriodPath(organizationId, '', period)}
        />
      </div>
    </>
  );
}

/** Shown while a workspace has no products, customers, or orders yet. */
function GetStarted({ organizationId }: { organizationId: string }) {
  const link = buttonVariants({ variant: 'secondary', size: 'sm' });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up your workspace</CardTitle>
        <CardDescription>
          The overview fills in as you add products, stock, customers, and orders.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Can permission="PRODUCTS_CREATE">
          <Link to={paths.productNew(organizationId)} className={link}>
            Add product
          </Link>
        </Can>
        <Link to={paths.warehouses(organizationId)} className={link}>
          Warehouses
        </Link>
        <Can permission="CUSTOMERS_CREATE">
          <Link to={paths.customers(organizationId)} className={link}>
            Create customer
          </Link>
        </Can>
        <Can permission="ORDERS_CREATE">
          <Link to={paths.orderNew(organizationId)} className={link}>
            Create order
          </Link>
        </Can>
      </CardContent>
    </Card>
  );
}

/** Placeholders in the shape of the dashboard (the header and range picker stay usable). */
function DashboardSkeleton() {
  return (
    <output className="flex flex-col gap-6">
      <span className="sr-only">Loading the dashboard</span>
      <Skeleton className="h-5 w-72 max-w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((card) => (
          <Card key={card} className="gap-3 p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-40" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <Skeleton className="h-64 w-full" />
        </Card>
        <Card className="gap-3 p-6">
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <Skeleton key={row} className="h-6 w-full" />
          ))}
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <Skeleton className="h-32 w-full" />
        </Card>
        <Card className="p-6">
          <Skeleton className="h-32 w-full" />
        </Card>
      </div>
    </output>
  );
}
