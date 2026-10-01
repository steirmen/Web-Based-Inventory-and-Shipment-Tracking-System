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
import { pageTitle } from '@/lib/app-config';
import { formatCount } from '@/lib/dashboard-params';
import { STOCK_STATUS_LABELS } from '@/lib/inventory-params';
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

  const columns: ReportColumn<InventoryReportRow, InventoryReportSortField>[] = [
    {
      key: 'product',
      header: 'Product',
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
              Archived
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'sku',
      header: 'SKU',
      sort: 'sku',
      cell: (row) => <span className="font-mono text-xs">{row.product.sku}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      sort: 'category',
      cell: (row) => row.category?.name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'warehouse',
      header: 'Warehouse',
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
            {row.warehouse.isActive ? '' : ' · archived'}
          </span>
        </span>
      ),
    },
    {
      key: 'quantity',
      header: 'In stock',
      sort: 'quantity',
      defaultOrder: 'desc',
      align: 'right',
      className: 'font-medium',
      cell: (row) => formatCount(row.quantity),
    },
    {
      key: 'minimum',
      header: 'Minimum',
      sort: 'minimumStock',
      defaultOrder: 'desc',
      align: 'right',
      cell: (row) => formatCount(row.minimumStock),
    },
    { key: 'status', header: 'Status', cell: (row) => <StockStatusBadge status={row.status} /> },
  ];

  const filtered = hasInventoryReportFilters(params);

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`Inventory report · ${organization.name}`)}</title>
      <PageHeader
        eyebrow="Reports"
        title="Inventory report"
        description="Current stock per product and warehouse, with its stock status. The movement history is under Stock movements."
        actions={
          <ExportButton
            onExport={() => exporter.mutate(query)}
            pending={exporter.isPending}
            error={exporter.error}
            disabled={!data || data.pagination.totalItems === 0}
          />
        }
      />
      <ReportTabs organizationId={organization.id} periodSearch="" />

      <search className="flex flex-col gap-3" aria-label="Inventory report filters">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
          <ReportSearch value={params.search} placeholder="Product or SKU…" onSearch={onSearch} />
          <FormField label="Stock status">
            {(control) => (
              <Select
                {...control}
                value={params.status}
                onChange={(event) =>
                  setParams({ status: event.target.value as InventoryReportParams['status'] })
                }
              >
                <option value="">All statuses</option>
                {STOCK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STOCK_STATUS_LABELS[status]}
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
                { label: 'Stock items', value: formatCount(data.totals.rows) },
                { label: 'Units', value: formatCount(data.totals.units) },
                { label: 'In stock', value: formatCount(data.totals.inStock) },
                { label: 'Low stock', value: formatCount(data.totals.lowStock) },
                { label: 'Out of stock', value: formatCount(data.totals.outOfStock) },
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
              Include archived products and warehouses
            </label>
            {filtered && <ClearFiltersButton onClear={clearFilters} />}
          </div>
        </div>
      </search>

      <ReportResults
        label="inventory report"
        query={report}
        totalItems={data?.pagination.totalItems}
        filtered={filtered}
        emptyTitle="No stock recorded yet."
        emptyDescription="Receive stock into a warehouse to see it here."
        emptyAction={
          <Link
            to={paths.inventory(organization.id)}
            className="text-sm font-medium text-primary hover:underline"
          >
            Go to inventory
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
            caption="Stock per product and warehouse"
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
