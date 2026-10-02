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
import { CurrencySwitch } from '@/components/dashboard/currency-switch';
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
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { insights } from '@/i18n/messages/insights';
import { pageTitle } from '@/lib/app-config';
import { cn } from '@/lib/cn';
import {
  browserTimeZone,
  type DashboardParams,
  formatDayRange,
  inventoryStatusPath,
  ordersInPeriodPath,
  readDashboardParams,
  toDashboardQuery,
  writeDashboardParams,
} from '@/lib/dashboard-params';
import { useFlashNotice } from '@/lib/flash-notice';
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
  const m = useMessages(insights).dashboard;

  const changeRange = (next: DashboardParams) => setSearchParams(writeDashboardParams(next));

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`${m.title} · ${organization.name}`)}</title>
      <PageHeader
        eyebrow={organization.name}
        title={m.title}
        description={m.description}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
            <RangePicker
              key={paramsKey}
              value={params}
              period={data?.period}
              onChange={changeRange}
            />
            {data && (
              <CurrencySwitch
                label={m.currency}
                value={data.currency}
                currencies={data.currencies}
                onChange={(currency) => changeRange({ ...params, currency })}
              />
            )}
          </div>
        }
      />

      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {summary.isError && !data ? (
        <ErrorState
          title={m.loadError}
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
              title={m.refreshError}
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
  const m = useMessages(insights).dashboard;
  const c = useMessages(common);
  const f = useFormat();
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      <CalendarRange className="size-4 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-medium text-foreground">
          {formatDayRange(period.from, period.to, f.locale)}
        </span>{' '}
        {m.comparedWith({
          previous: formatDayRange(comparisonPeriod.from, comparisonPeriod.to, f.locale),
        })}
      </span>
      <span className="text-xs">({period.timeZone})</span>
      <span className="text-xs" title={m.currencyHint}>
        · {data.currency} ({c.currency[data.currency]})
      </span>
      <span className="sr-only" aria-live="polite">
        {updating ? m.updating : ''}
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
  const { kpis, period, comparisonPeriod, currency } = data;
  const m = useMessages(insights).dashboard;
  const f = useFormat();
  const comparison = formatDayRange(comparisonPeriod.from, comparisonPeriod.to, f.locale);
  const isNewWorkspace =
    kpis.activeProducts + kpis.archivedProducts === 0 &&
    kpis.activeCustomers + kpis.archivedCustomers === 0 &&
    kpis.orders.current === 0;

  return (
    <>
      {isNewWorkspace && <GetStarted organizationId={organizationId} />}

      <section aria-labelledby="dashboard-kpis" className="flex flex-col gap-3">
        <h2 id="dashboard-kpis" className="sr-only">
          {m.keyFigures}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label={m.totalSales}
            value={f.money(kpis.sales.current, currency)}
            icon={<Wallet />}
          >
            <ChangeIndicator
              metric={kpis.sales}
              kind="money"
              comparison={comparison}
              currency={currency}
            />
          </KpiCard>
          <KpiCard label={m.orders} value={f.number(kpis.orders.current)} icon={<ShoppingCart />}>
            <ChangeIndicator metric={kpis.orders} kind="count" comparison={comparison} />
          </KpiCard>
          <KpiCard label={m.customers} value={f.number(kpis.activeCustomers)} icon={<Users />}>
            <p>{m.customersLine({ count: f.number(kpis.newCustomers.current) })}</p>
          </KpiCard>
          <KpiCard label={m.products} value={f.number(kpis.activeProducts)} icon={<Package />}>
            <p>{m.productsLine({ count: f.number(kpis.archivedProducts) })}</p>
          </KpiCard>
          <KpiCard
            label={m.inventoryUnits}
            value={
              <>
                {f.number(kpis.inventoryUnits)}{' '}
                <span className="text-base font-medium text-muted-foreground">{m.units}</span>
              </>
            }
            icon={<Boxes />}
          >
            <p>
              {m.unitsLine({
                count: f.number(kpis.activeWarehouses),
                warehouses: kpis.activeWarehouses,
              })}
            </p>
          </KpiCard>
          <KpiCard
            label={m.lowStock}
            value={f.number(kpis.lowStockItems)}
            icon={<TriangleAlert />}
            emphasis={kpis.lowStockItems + kpis.outOfStockItems > 0}
          >
            <p className="flex flex-wrap gap-x-2">
              <span>{m.outOfStock({ count: f.number(kpis.outOfStockItems) })}</span>
              <Link
                to={inventoryStatusPath(organizationId, 'LOW_STOCK')}
                className="rounded-sm font-medium text-primary focus-ring hover:underline"
              >
                {m.viewLowStock}
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
            currency={currency}
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
          currency={currency}
          salesReportHref={salesReportPath(organizationId, {
            range: period.range,
            from: period.range === 'CUSTOM' ? period.from : '',
            to: period.range === 'CUSTOM' ? period.to : '',
            currency,
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
  const m = useMessages(insights).dashboard;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.setupTitle}</CardTitle>
        <CardDescription>{m.setupText}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Can permission="PRODUCTS_CREATE">
          <Link to={paths.productNew(organizationId)} className={link}>
            {m.addProduct}
          </Link>
        </Can>
        <Link to={paths.warehouses(organizationId)} className={link}>
          {m.warehouses}
        </Link>
        <Can permission="CUSTOMERS_CREATE">
          <Link to={paths.customers(organizationId)} className={link}>
            {m.createCustomer}
          </Link>
        </Can>
        <Can permission="ORDERS_CREATE">
          <Link to={paths.orderNew(organizationId)} className={link}>
            {m.createOrder}
          </Link>
        </Can>
      </CardContent>
    </Card>
  );
}

/** Placeholders in the shape of the dashboard (the header and range picker stay usable). */
function DashboardSkeleton() {
  const m = useMessages(insights).dashboard;
  return (
    <output className="flex flex-col gap-6">
      <span className="sr-only">{m.loading}</span>
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
