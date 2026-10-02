import {
  type InventoryReportRow,
  type InventoryReportSortField,
  STOCK_STATUSES,
} from '@app/shared';
import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router';
import { StockStatusBadge } from '@/components/inventory/inventory-badges';
import { PageHeader } from '@/components/layout/page-header';
import {
  ClearFiltersButton,
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
import { useCategories } from '@/hooks/use-catalog';
import { useWarehouses } from '@/hooks/use-inventory';
import { useInventoryReport, useReportExport } from '@/hooks/use-reports';
import { useFormat } from '@/i18n/format';
import { useLanguage, useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { insights } from '@/i18n/messages/insights';
import { pageTitle } from '@/lib/app-config';
import { useCurrentOrganization } from '@/lib/organization-context';
import {
  hasInventoryReportFilters,
  type InventoryReportParams,
  nextSort,
  readInventoryReportParams,
  toInventoryReportQuery,
  writeInventoryReportParams,
} from '@/lib/report-params';
import { paths } from '@/routes/paths';

/**
 * Current stock per product and warehouse with the Phase 6 status (the stock
 * movement history stays on its own page). By default only sellable stock
 * (active products, active warehouses), like the dashboard.
 */
export function InventoryReportPage() {
  const { organization } = useCurrentOrganization();
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readInventoryReportParams(searchParams);
  const query = toInventoryReportQuery(params);
  const report = useInventoryReport(organization.id, query);
  const exporter = useReportExport(organization.id, 'inventory');
  const warehouses = useWarehouses(organization.id);
  const categories = useCategories(organization.id);
  const data = report.data;

  const setParams = (changes: Partial<InventoryReportParams>) => {
    exporter.reset();
    setSearchParams(writeInventoryReportParams({ ...params, page: 1, ...changes }));
  };
  const onSearch = useCallback(
    (search: string) =>
      setSearchParams(
        (current) =>
          writeInventoryReportParams({ ...readInventoryReportParams(current), search, page: 1 }),
        { replace: true },
      ),
    [setSearchParams],
  );
  const clearFilters = () =>
    setParams({
      search: '',
      warehouseId: '',
      productId: '',
      categoryId: '',
      status: '',
      includeArchived: false,
    });

  const r = useMessages(insights);
  const m = r.inventoryReport;
  const c = useMessages(common);
  const f = useFormat();
  const language = useLanguage().language;

  const columns: ReportColumn<InventoryReportRow, InventoryReportSortField>[] = [
    {
      key: 'product',
      header: m.product,
      sort: 'productName',
      className: 'max-w-64',
      cell: (row) => (
        <span className="flex flex-col">
          <Link
            to={paths.product(organization.id, row.product.id)}
            className="truncate rounded-sm font-medium focus-ring hover:underline"
          >
            {row.product.name}
          </Link>
          {row.product.status === 'ARCHIVED' && (
            <Badge tone="neutral" className="mt-1 self-start">
              {m.archivedWarehouse}
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'sku',
      header: m.sku,
      sort: 'sku',
      cell: (row) => <span className="font-mono text-xs">{row.product.sku}</span>,
    },
    {
      key: 'category',
      header: m.category,
      sort: 'category',
      cell: (row) => row.category?.name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'warehouse',
      header: m.warehouse,
      sort: 'warehouse',
      cell: (row) => (
        <span className="flex flex-col">
          <Link
            to={paths.warehouse(organization.id, row.warehouse.id)}
            className="rounded-sm focus-ring hover:underline"
          >
            {row.warehouse.name}
          </Link>
          <span className="font-mono text-xs text-muted-foreground">
            {row.warehouse.code}
            {row.warehouse.isActive ? '' : ` · ${m.archivedWarehouse.toLowerCase()}`}
          </span>
        </span>
      ),
    },
    {
      key: 'quantity',
      header: m.inStock,
      sort: 'quantity',
      defaultOrder: 'desc',
      align: 'right',
      className: 'font-medium',
      cell: (row) => f.number(row.quantity),
    },
    {
      key: 'minimum',
      header: m.minimum,
      sort: 'minimumStock',
      defaultOrder: 'desc',
      align: 'right',
      cell: (row) => f.number(row.minimumStock),
    },
    { key: 'status', header: m.status, cell: (row) => <StockStatusBadge status={row.status} /> },
  ];

  const filtered = hasInventoryReportFilters(params);

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
      <ReportTabs organizationId={organization.id} periodSearch="" />

      <search className="flex flex-col gap-3" aria-label={m.filters}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <ReportSearch
            value={params.search}
            placeholder={m.searchPlaceholder}
            onSearch={onSearch}
          />
          <FormField label={m.stockStatus}>
            {(control) => (
              <Select
                {...control}
                value={params.status}
                onChange={(event) =>
                  setParams({ status: event.target.value as InventoryReportParams['status'] })
                }
              >
                <option value="">{m.allStatuses}</option>
                {STOCK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {c.stockStatus[status]}
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
                { label: m.stockItems, value: f.number(data.totals.rows) },
                { label: m.units, value: f.number(data.totals.units) },
                { label: m.inStock, value: f.number(data.totals.inStock) },
                { label: m.lowStock, value: f.number(data.totals.lowStock) },
                { label: m.outOfStock, value: f.number(data.totals.outOfStock) },
              ]}
            />
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={params.includeArchived}
                onChange={(event) => setParams({ includeArchived: event.target.checked })}
                className="size-4 rounded-sm accent-primary focus-ring"
              />
              {m.includeArchived}
            </label>
            {filtered && <ClearFiltersButton onClear={clearFilters} />}
          </div>
        </div>
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
            to={paths.inventory(organization.id)}
            className="text-sm font-medium text-primary hover:underline"
          >
            {m.goToInventory}
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
            rowKey={(row) => row.inventoryId}
            sort={params.sort}
            dimmed={report.isPlaceholderData}
            onSort={(field, order) => setParams({ sort: nextSort(params.sort, field, order) })}
          />
        )}
      </ReportResults>
    </div>
  );
}
