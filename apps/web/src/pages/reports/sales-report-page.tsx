import { SALES_REPORT_STATUSES, type SalesReportRow, type SalesReportSortField } from '@app/shared';
import { X } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { RangePicker } from '@/components/dashboard/range-picker';
import { PageHeader } from '@/components/layout/page-header';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import {
  ClearFiltersButton,
  ReportCustomerFilter,
  ExportButton,
  type ReportColumn,
  ReportResults,
  ReportSearch,
  ReportSummary,
  ReportTable,
  ReportTabs,
} from '@/components/reports/report-parts';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { useCategories, useProduct } from '@/hooks/use-catalog';
import { useWarehouses } from '@/hooks/use-inventory';
import { useReportExport, useSalesReport } from '@/hooks/use-reports';
import { pageTitle } from '@/lib/app-config';
import {
  browserTimeZone,
  formatCount,
  formatDayRange,
  writeDashboardParams,
} from '@/lib/dashboard-params';
import { formatDateTime } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { useCurrentOrganization } from '@/lib/organization-context';
import {
  hasSalesFilters,
  nextSort,
  readSalesParams,
  type SalesReportParams,
  toSalesQuery,
  writeSalesParams,
} from '@/lib/report-params';
import { ORDER_STATUS_LABELS } from '@/lib/sales-params';
import { paths } from '@/routes/paths';

/**
 * Realized sales (processing, shipped, and completed orders) with units and
 * revenue from the order lines, filtered and sorted on the server, exported
 * with the same filters. Same definitions as the dashboard's sales KPI.
 */
export function SalesReportPage() {
  const { organization } = useCurrentOrganization();
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readSalesParams(searchParams);
  const timeZone = useMemo(() => browserTimeZone(), []);
  const query = toSalesQuery(params, timeZone);
  const report = useSalesReport(organization.id, query);
  const exporter = useReportExport(organization.id, 'sales');
  const warehouses = useWarehouses(organization.id);
  const categories = useCategories(organization.id);
  const data = report.data;

  const setParams = (changes: Partial<SalesReportParams>) => {
    exporter.reset();
    setSearchParams(writeSalesParams({ ...params, page: 1, ...changes }));
  };
  const onSearch = useCallback(
    (search: string) =>
      setSearchParams(
        (current) => writeSalesParams({ ...readSalesParams(current), search, page: 1 }),
        { replace: true },
      ),
    [setSearchParams],
  );
  const clearFilters = () =>
    setParams({
      search: '',
      warehouseId: '',
      customerId: '',
      productId: '',
      categoryId: '',
      status: '',
    });

  const columns: ReportColumn<SalesReportRow, SalesReportSortField>[] = [
    {
      key: 'date',
      header: 'Date',
      sort: 'date',
      defaultOrder: 'desc',
      className: 'whitespace-nowrap text-muted-foreground',
      cell: (row) => formatDateTime(row.date),
    },
    {
      key: 'order',
      header: 'Order',
      sort: 'orderNumber',
      cell: (row) => (
        <Link
          to={paths.order(organization.id, row.orderId)}
          className="rounded-sm font-medium focus-ring hover:underline"
        >
          {row.orderNumber}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      sort: 'customer',
      className: 'max-w-56',
      cell: (row) =>
        row.customer ? (
          <span className="block truncate">
            {row.customer.name}
            {row.customer.companyName && (
              <span className="block truncate text-xs text-muted-foreground">
                {row.customer.companyName}
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">No customer</span>
        ),
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
      cell: (row) => <span className="font-mono text-xs">{row.warehouse.code}</span>,
    },
    { key: 'status', header: 'Status', cell: (row) => <OrderStatusBadge status={row.status} /> },
    {
      key: 'units',
      header: 'Units',
      sort: 'units',
      defaultOrder: 'desc',
      align: 'right',
      cell: (row) => formatCount(row.units),
    },
    {
      key: 'revenue',
      header: 'Revenue',
      sort: 'revenue',
      defaultOrder: 'desc',
      align: 'right',
      className: 'font-medium',
      cell: (row) => formatMoney(row.revenue),
    },
  ];

  const filtered = hasSalesFilters(params);

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`Sales report · ${organization.name}`)}</title>
      <PageHeader
        eyebrow="Reports"
        title="Sales report"
        description="Realized sales: orders that are processing, shipped, or completed, with units and revenue at the prices on the order."
        actions={
          <ExportButton
            onExport={() => exporter.mutate(query)}
            pending={exporter.isPending}
            error={exporter.error}
            disabled={!data || data.pagination.totalItems === 0}
          />
        }
      />
      <ReportTabs
        organizationId={organization.id}
        periodSearch={writeDashboardParams(params.period).toString()}
      />

      <search className="flex flex-col gap-3" aria-label="Sales report filters">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {data
              ? `${formatDayRange(data.period.from, data.period.to)} (${data.period.timeZone})`
              : 'Date range'}
          </p>
          <RangePicker
            key={writeDashboardParams(params.period).toString()}
            value={params.period}
            period={data?.period}
            onChange={(period) => setParams({ period })}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
          <ReportSearch
            value={params.search}
            placeholder="Order, customer, or product…"
            onSearch={onSearch}
          />
          <FormField label="Status">
            {(control) => (
              <Select
                {...control}
                value={params.status}
                onChange={(event) =>
                  setParams({ status: event.target.value as SalesReportParams['status'] })
                }
              >
                <option value="">All realized</option>
                {SALES_REPORT_STATUSES.map((status) => (
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
          <FormField label="Customer">
            {(control) => (
              <ReportCustomerFilter
                control={control}
                customerId={params.customerId}
                onChange={(customerId) => setParams({ customerId })}
              />
            )}
          </FormField>
          <FormField label="Category">
            {(control) => (
              <Select
                {...control}
                value={params.categoryId}
                onChange={(event) => setParams({ categoryId: event.target.value })}
              >
                <option value="">All categories</option>
                {categories.data?.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </div>
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
          {data && data.pagination.totalItems > 0 ? (
            <ReportSummary
              items={[
                { label: 'Orders', value: formatCount(data.totals.orders) },
                { label: 'Units', value: formatCount(data.totals.units) },
                { label: 'Revenue', value: formatMoney(data.totals.revenue) },
              ]}
            />
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {params.productId && (
              <ProductFilterChip
                productId={params.productId}
                onClear={() => setParams({ productId: '' })}
              />
            )}
            {filtered && <ClearFiltersButton onClear={clearFilters} />}
          </div>
        </div>
        {(params.productId || params.categoryId) && (
          <p className="text-xs text-muted-foreground">
            Units and revenue count only the lines of the selected product or category.
          </p>
        )}
      </search>

      <ReportResults
        label="sales report"
        query={report}
        totalItems={data?.pagination.totalItems}
        filtered={filtered}
        emptyTitle="No sales in this period."
        emptyDescription="Orders appear here once they are processed (their stock deducted). Try a longer date range."
        emptyAction={
          <Link
            to={paths.orders(organization.id)}
            className="text-sm font-medium text-primary hover:underline"
          >
            View orders
          </Link>
        }
        onClearFilters={clearFilters}
        page={data?.pagination.page ?? 1}
        pageSize={data?.pagination.pageSize ?? 25}
        totalPages={data?.pagination.totalPages ?? 0}
        onPageChange={(page) => setParams({ page })}
      >
        {data && (
          <ReportTable
            caption="Realized sales"
            columns={columns}
            rows={data.items}
            rowKey={(row) => row.orderId}
            sort={params.sort}
            dimmed={report.isPlaceholderData}
            onSort={(field, order) => setParams({ sort: nextSort(params.sort, field, order) })}
          />
        )}
      </ReportResults>
    </div>
  );
}

/** The product filter (set from the dashboard's top products), with the product's name. */
function ProductFilterChip({ productId, onClear }: { productId: string; onClear: () => void }) {
  const { organization } = useCurrentOrganization();
  const product = useProduct(organization.id, productId);
  return (
    <Badge tone="primary" className="gap-2 py-1">
      Product: {product.data?.product.name ?? '…'}
      <button
        type="button"
        onClick={onClear}
        className="rounded-full focus-ring"
        aria-label="Remove the product filter"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </Badge>
  );
}
