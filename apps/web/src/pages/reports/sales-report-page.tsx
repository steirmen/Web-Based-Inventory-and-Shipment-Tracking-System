import { SALES_REPORT_STATUSES, type SalesReportRow, type SalesReportSortField } from '@app/shared';
import { X } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { RangePicker } from '@/components/dashboard/range-picker';
import { CurrencySwitch } from '@/components/dashboard/currency-switch';
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
import { useFormat } from '@/i18n/format';
import { useLanguage, useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { insights } from '@/i18n/messages/insights';
import { pageTitle } from '@/lib/app-config';
import { browserTimeZone, formatDayRange, writeDashboardParams } from '@/lib/dashboard-params';
import { useCurrentOrganization } from '@/lib/organization-context';
import {
  hasSalesFilters,
  nextSort,
  readSalesParams,
  type SalesReportParams,
  toSalesQuery,
  writeSalesParams,
} from '@/lib/report-params';
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
  const r = useMessages(insights);
  const m = r.salesReport;
  const c = useMessages(common);
  const f = useFormat();
  const language = useLanguage().language;

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
      header: m.date,
      sort: 'date',
      defaultOrder: 'desc',
      className: 'whitespace-nowrap text-muted-foreground',
      cell: (row) => f.dateTime(row.date),
    },
    {
      key: 'order',
      header: m.order,
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
      header: m.customer,
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
          <span className="text-muted-foreground">{r.reports.noCustomer}</span>
        ),
    },
    {
      key: 'warehouse',
      header: m.warehouse,
      cell: (row) => <span className="font-mono text-xs">{row.warehouse.code}</span>,
    },
    { key: 'status', header: m.status, cell: (row) => <OrderStatusBadge status={row.status} /> },
    {
      key: 'units',
      header: m.units,
      sort: 'units',
      defaultOrder: 'desc',
      align: 'right',
      cell: (row) => f.number(row.units),
    },
    {
      key: 'revenue',
      header: m.revenue,
      sort: 'revenue',
      defaultOrder: 'desc',
      align: 'right',
      className: 'font-medium whitespace-nowrap',
      cell: (row) => f.money(row.revenue, row.currency),
    },
  ];

  const filtered = hasSalesFilters(params);

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`${m.title} · ${organization.name}`)}</title>
      <PageHeader
        eyebrow={r.reports.eyebrow}
        title={m.title}
        description={m.description}
        actions={
          <ExportButton
            onExport={(format) =>
              exporter.mutate({
                // Exactly the rows shown: the report's currency when the server chose it.
                query: data && !query.currency ? { ...query, currency: data.currency } : query,
                format,
                lang: language,
              })
            }
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

      <search className="flex flex-col gap-3" aria-label={m.filters}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {data
              ? `${formatDayRange(data.period.from, data.period.to, f.locale)} (${data.period.timeZone})`
              : r.reports.dateRange}
          </p>
          {data && (
            <CurrencySwitch
              label={r.reports.currency}
              value={data.currency}
              currencies={data.currencies}
              onChange={(currency) => setParams({ period: { ...params.period, currency } })}
            />
          )}
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
            placeholder={m.searchPlaceholder}
            onSearch={onSearch}
          />
          <FormField label={r.reports.status}>
            {(control) => (
              <Select
                {...control}
                value={params.status}
                onChange={(event) =>
                  setParams({ status: event.target.value as SalesReportParams['status'] })
                }
              >
                <option value="">{m.allRealized}</option>
                {SALES_REPORT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {c.orderStatus[status]}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label={r.reports.warehouse}>
            {(control) => (
              <Select
                {...control}
                value={params.warehouseId}
                onChange={(event) => setParams({ warehouseId: event.target.value })}
              >
                <option value="">{r.reports.allWarehouses}</option>
                {warehouses.data?.warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                    {warehouse.isActive ? '' : r.reports.archivedSuffix}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label={r.reports.customer}>
            {(control) => (
              <ReportCustomerFilter
                control={control}
                customerId={params.customerId}
                onChange={(customerId) => setParams({ customerId })}
              />
            )}
          </FormField>
          <FormField label={r.reports.category}>
            {(control) => (
              <Select
                {...control}
                value={params.categoryId}
                onChange={(event) => setParams({ categoryId: event.target.value })}
              >
                <option value="">{r.reports.allCategories}</option>
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
                { label: m.orders, value: f.number(data.totals.orders) },
                { label: m.units, value: f.number(data.totals.units) },
                { label: m.revenue, value: f.money(data.totals.revenue, data.currency) },
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
          <p className="text-xs text-muted-foreground">{m.linesOnly}</p>
        )}
      </search>

      <ReportResults
        label={m.noun}
        query={report}
        totalItems={data?.pagination.totalItems}
        filtered={filtered}
        emptyTitle={m.empty}
        emptyDescription={m.emptyText}
        emptyAction={
          <Link
            to={paths.orders(organization.id)}
            className="text-sm font-medium text-primary hover:underline"
          >
            {r.reports.viewOrders}
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
            caption={m.caption}
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
  const m = useMessages(insights).salesReport;
  const product = useProduct(organization.id, productId);
  return (
    <Badge tone="primary" className="gap-2 py-1">
      {m.productChip({ name: product.data?.product.name ?? '…' })}
      <button
        type="button"
        onClick={onClear}
        className="rounded-full focus-ring"
        aria-label={m.removeProduct}
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </Badge>
  );
}
