import {
  CURRENCIES,
  ORDER_STATUSES,
  type OrdersReportRow,
  type OrdersReportSortField,
} from '@app/shared';
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
import { useFormat } from '@/i18n/format';
import { useLanguage, useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { insights } from '@/i18n/messages/insights';
import { pageTitle } from '@/lib/app-config';
import { browserTimeZone, formatDayRange, writeDashboardParams } from '@/lib/dashboard-params';
import { useCurrentOrganization } from '@/lib/organization-context';
import {
  hasOrdersReportFilters,
  nextSort,
  type OrdersReportParams,
  readOrdersReportParams,
  toOrdersReportQuery,
  writeOrdersReportParams,
} from '@/lib/report-params';
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
  const r = useMessages(insights);
  const m = r.ordersReport;
  const c = useMessages(common);
  const f = useFormat();
  const language = useLanguage().language;

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
    {
      key: 'status',
      header: m.status,
      sort: 'status',
      cell: (row) => <OrderStatusBadge status={row.status} />,
    },
    {
      key: 'items',
      header: m.lines,
      align: 'right',
      cell: (row) => f.number(row.itemCount),
    },
    {
      key: 'total',
      header: m.total,
      sort: 'total',
      defaultOrder: 'desc',
      align: 'right',
      className: 'font-medium whitespace-nowrap',
      cell: (row) => f.money(row.total, row.currency),
    },
    {
      key: 'created',
      header: m.created,
      sort: 'createdAt',
      defaultOrder: 'desc',
      className: 'whitespace-nowrap text-muted-foreground',
      cell: (row) => f.dateTime(row.createdAt),
    },
  ];

  const filtered = hasOrdersReportFilters(params);

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`${m.title} · ${organization.name}`)}</title>
      <PageHeader
        eyebrow={r.reports.eyebrow}
        title={m.title}
        description={m.description}
        actions={
          <ExportButton
            onExport={(format) => exporter.mutate({ query, format, lang: language })}
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
                  setParams({ status: event.target.value as OrdersReportParams['status'] })
                }
              >
                <option value="">{m.allStatuses}</option>
                {ORDER_STATUSES.map((status) => (
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
          <FormField label={r.reports.currency}>
            {(control) => (
              <Select
                {...control}
                value={params.period.currency}
                onChange={(event) =>
                  setParams({
                    period: {
                      ...params.period,
                      currency: event.target.value as OrdersReportParams['period']['currency'],
                    },
                  })
                }
              >
                <option value="">{r.reports.allCurrencies}</option>
                {CURRENCIES.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency} · {c.currency[currency]}
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
                ...data.totals.values.map((value) => ({
                  label: `${m.orderValue} (${value.currency})`,
                  value: f.money(value.amount, value.currency),
                })),
              ]}
            />
          ) : (
            <span />
          )}
          {filtered && <ClearFiltersButton onClear={clearFilters} />}
        </div>
      </search>

      <ReportResults
        label={m.noun}
        query={report}
        totalItems={data?.pagination.totalItems}
        filtered={filtered}
        emptyTitle={m.empty}
        emptyDescription={m.emptyText}
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
