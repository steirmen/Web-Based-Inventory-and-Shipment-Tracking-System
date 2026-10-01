import { ORDER_STATUSES, type OrdersReportRow, type OrdersReportSortField } from '@app/shared';
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
import { FormField } from '@/components/ui/form-field';
import { Select } from '@/components/ui/select';
import { useWarehouses } from '@/hooks/use-inventory';
import { useOrdersReport, useReportExport } from '@/hooks/use-reports';
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
  hasOrdersReportFilters,
  nextSort,
  type OrdersReportParams,
  readOrdersReportParams,
  toOrdersReportQuery,
  writeOrdersReportParams,
} from '@/lib/report-params';
import { ORDER_STATUS_LABELS } from '@/lib/sales-params';
import { paths } from '@/routes/paths';

/** Orders of every status created in the period, filtered, sorted, and exported on the server. */
export function OrdersReportPage() {
  const { organization } = useCurrentOrganization();
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readOrdersReportParams(searchParams);
  const timeZone = useMemo(() => browserTimeZone(), []);
  const query = toOrdersReportQuery(params, timeZone);
  const report = useOrdersReport(organization.id, query);
  const exporter = useReportExport(organization.id, 'orders');
  const warehouses = useWarehouses(organization.id);
  const data = report.data;

  const setParams = (changes: Partial<OrdersReportParams>) => {
    exporter.reset();
    setSearchParams(writeOrdersReportParams({ ...params, page: 1, ...changes }));
  };
  const onSearch = useCallback(
    (search: string) =>
      setSearchParams(
        (current) =>
          writeOrdersReportParams({ ...readOrdersReportParams(current), search, page: 1 }),
        { replace: true },
      ),
    [setSearchParams],
  );
  const clearFilters = () => setParams({ search: '', status: '', warehouseId: '', customerId: '' });

  const columns: ReportColumn<OrdersReportRow, OrdersReportSortField>[] = [
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
    {
      key: 'status',
      header: 'Status',
      sort: 'status',
      cell: (row) => <OrderStatusBadge status={row.status} />,
    },
    {
      key: 'items',
      header: 'Lines',
      align: 'right',
      cell: (row) => formatCount(row.itemCount),
    },
    {
      key: 'total',
      header: 'Total',
      sort: 'total',
      defaultOrder: 'desc',
      align: 'right',
      className: 'font-medium',
      cell: (row) => formatMoney(row.total),
    },
    {
      key: 'created',
      header: 'Created',
      sort: 'createdAt',
      defaultOrder: 'desc',
      className: 'whitespace-nowrap text-muted-foreground',
      cell: (row) => formatDateTime(row.createdAt),
    },
  ];

  const filtered = hasOrdersReportFilters(params);

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`Orders report · ${organization.name}`)}</title>
      <PageHeader
        eyebrow="Reports"
        title="Orders report"
        description="Every order created in the period, whatever its status."
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

      <search className="flex flex-col gap-3" aria-label="Orders report filters">
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <ReportSearch
            value={params.search}
            placeholder="Order or customer…"
            onSearch={onSearch}
          />
          <FormField label="Status">
            {(control) => (
              <Select
                {...control}
                value={params.status}
                onChange={(event) =>
                  setParams({ status: event.target.value as OrdersReportParams['status'] })
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
          <FormField label="Customer">
            {(control) => (
              <ReportCustomerFilter
                control={control}
                customerId={params.customerId}
                onChange={(customerId) => setParams({ customerId })}
              />
            )}
          </FormField>
        </div>
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
          {data && data.pagination.totalItems > 0 ? (
            <ReportSummary
              items={[
                { label: 'Orders', value: formatCount(data.totals.orders) },
                { label: 'Order value', value: formatMoney(data.totals.value) },
              ]}
            />
          ) : (
            <span />
          )}
          {filtered && <ClearFiltersButton onClear={clearFilters} />}
        </div>
      </search>

      <ReportResults
        label="orders report"
        query={report}
        totalItems={data?.pagination.totalItems}
        filtered={filtered}
        emptyTitle="No orders in this period."
        emptyDescription="Try a longer date range."
        onClearFilters={clearFilters}
        page={data?.pagination.page ?? 1}
        pageSize={data?.pagination.pageSize ?? 25}
        totalPages={data?.pagination.totalPages ?? 0}
        onPageChange={(page) => setParams({ page })}
      >
        {data && (
          <ReportTable
            caption="Orders"
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
