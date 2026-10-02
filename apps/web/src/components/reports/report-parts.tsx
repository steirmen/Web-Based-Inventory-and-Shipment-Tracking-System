import { type ExportFormat, REPORT_TYPES, type SortOrder } from '@app/shared';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { NavLink } from 'react-router';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/layout/page-state';
import { PaginationBar } from '@/components/layout/pagination-bar';
import { Can } from '@/components/organization/can';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CustomerPicker } from '@/components/customers/customer-picker';
import { Card } from '@/components/ui/card';
import { Menu, menuItemClass } from '@/components/ui/menu';
import { type FieldControlProps, FormField } from '@/components/ui/form-field';
import { SearchInput } from '@/components/ui/search-input';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCustomer } from '@/hooks/use-sales';
import { useMessages } from '@/i18n/i18n-context';
import { insights } from '@/i18n/messages/insights';
import { useApiErrorMessage } from '@/lib/api-errors';
import { useCurrentOrganization } from '@/lib/organization-context';
import { cn } from '@/lib/cn';
import { reportPath, type ReportSort } from '@/lib/report-params';

/** Sales / Orders / Inventory. Sales and orders links keep the current date range. */
export function ReportTabs({
  organizationId,
  periodSearch,
}: {
  organizationId: string;
  /** `range=…&from=…&to=…` of the current page (kept when switching between dated reports). */
  periodSearch: string;
}) {
  const m = useMessages(insights).reports;
  return (
    <nav aria-label={m.tabs} className="flex gap-1 overflow-x-auto">
      {REPORT_TYPES.map((type) => (
        <NavLink
          key={type}
          to={reportPath(organizationId, type, type === 'inventory' ? '' : periodSearch)}
          className={({ isActive }) =>
            cn(
              'shrink-0 rounded-control px-3 py-1.5 text-sm font-medium focus-ring transition-colors',
              isActive
                ? 'bg-primary-soft text-primary-soft-foreground'
                : 'text-muted-foreground hover:bg-surface-muted hover:text-foreground',
            )
          }
        >
          {m.titles[type]}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * Export of the report as currently filtered and sorted: an Excel workbook
 * (opens as a table in every Excel locale) or a CSV file, with the labels in
 * the interface language. Hidden without REPORTS_EXPORT (the API checks too).
 */
export function ExportButton({
  onExport,
  pending,
  error,
  disabled = false,
}: {
  onExport: (format: ExportFormat) => void;
  pending: boolean;
  error: unknown;
  disabled?: boolean;
}) {
  const m = useMessages(insights).reports;
  const errorMessage = useApiErrorMessage();
  return (
    <Can permission="REPORTS_EXPORT">
      <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
        <Menu
          label={m.exportMenu}
          align="end"
          className="w-56"
          trigger={(props) => (
            <Button
              {...props}
              variant="secondary"
              isLoading={pending}
              disabled={disabled || pending}
              className="w-full sm:w-auto"
            >
              {!pending && <Download aria-hidden="true" />}
              {m.export}
              <ChevronDown aria-hidden="true" />
            </Button>
          )}
        >
          {(close) => (
            <>
              <button
                type="button"
                role="menuitem"
                className={menuItemClass}
                onClick={() => {
                  close();
                  onExport('xlsx');
                }}
              >
                <FileSpreadsheet className="text-subtle-foreground" aria-hidden="true" />
                {m.exportExcel}
              </button>
              <button
                type="button"
                role="menuitem"
                className={menuItemClass}
                onClick={() => {
                  close();
                  onExport('csv');
                }}
              >
                <FileText className="text-subtle-foreground" aria-hidden="true" />
                {m.exportCsv}
              </button>
              <p className="px-2.5 pt-1.5 pb-1 text-xs text-muted-foreground">{m.exportHint}</p>
            </>
          )}
        </Menu>
        {error ? (
          <Alert tone="danger" className="sm:max-w-sm">
            {errorMessage(error)}
          </Alert>
        ) : null}
      </div>
    </Can>
  );
}

const SEARCH_DEBOUNCE_MS = 300;

/** A search field that reports its value after typing pauses. */
export function ReportSearch({
  value,
  placeholder,
  onSearch,
}: {
  value: string;
  placeholder: string;
  onSearch: (search: string) => void;
}) {
  const m = useMessages(insights).reports;
  const [input, setInput] = useState(value);
  // Follow outside changes (e.g. "Clear filters") without remounting (which would drop focus).
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (value.trim() !== input.trim()) setInput(value);
  }

  useEffect(() => {
    if (input.trim() === value.trim()) return;
    const timeout = setTimeout(() => onSearch(input), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [input, value, onSearch]);

  return (
    <FormField label={m.search}>
      {(control) => (
        <SearchInput
          {...control}
          placeholder={placeholder}
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
      )}
    </FormField>
  );
}

export function ClearFiltersButton({ onClear }: { onClear: () => void }) {
  const m = useMessages(insights).reports;
  return (
    <Button variant="ghost" size="sm" onClick={onClear}>
      <X aria-hidden="true" />
      {m.clearFilters}
    </Button>
  );
}

/** Totals of everything that matches (not just this page), as labelled values. */
export function ReportSummary({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-2">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="font-semibold text-foreground tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface ReportColumn<Row, Field extends string> {
  key: string;
  header: string;
  /** Server-side sort field (whitelisted); omitted for columns that can't be sorted. */
  sort?: Field;
  /** First order when this column becomes the sort column. */
  defaultOrder?: SortOrder;
  align?: 'right';
  className?: string;
  cell: (row: Row) => ReactNode;
}

/**
 * A report table with sortable column headers (buttons inside `<th>` with
 * `aria-sort`). It scrolls horizontally inside its card on narrow screens;
 * the page itself never does.
 */
export function ReportTable<Row, Field extends string>({
  caption,
  columns,
  rows,
  rowKey,
  sort,
  onSort,
  dimmed,
}: {
  caption: string;
  columns: ReportColumn<Row, Field>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  sort: ReportSort<Field>;
  onSort: (field: Field, defaultOrder: SortOrder) => void;
  dimmed?: boolean;
}) {
  return (
    <Card className={cn('overflow-hidden', dimmed && 'opacity-70')}>
      <Table className="min-w-[44rem]">
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <tr>
            {columns.map((column) => {
              const active = column.sort !== undefined && column.sort === sort.field;
              const Icon = !active ? ArrowUpDown : sort.order === 'asc' ? ArrowUp : ArrowDown;
              return (
                <TableHead
                  key={column.key}
                  align={column.align}
                  aria-sort={
                    active ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                >
                  {column.sort ? (
                    <button
                      type="button"
                      onClick={() => onSort(column.sort!, column.defaultOrder ?? 'asc')}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-sm focus-ring hover:text-foreground',
                        active && 'text-foreground',
                      )}
                    >
                      {column.header}
                      <Icon className="size-3.5" aria-hidden="true" />
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              );
            })}
          </tr>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((column) => (
                <TableCell key={column.key} align={column.align} className={column.className}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

/**
 * Loading / error / empty / table + pagination for a report query. Errors
 * never fall back to empty tables; "no matches" and "no data yet" differ.
 */
export function ReportResults({
  label,
  query,
  totalItems,
  filtered,
  emptyTitle,
  emptyDescription,
  emptyAction,
  onClearFilters,
  children,
  page,
  pageSize,
  totalPages,
  onPageChange,
}: {
  label: string;
  query: {
    isPending: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
    isPlaceholderData: boolean;
    isFetching: boolean;
  };
  totalItems: number | undefined;
  filtered: boolean;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onClearFilters: () => void;
  children: ReactNode;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const m = useMessages(insights).reports;
  if (query.isPending) return <ListSkeleton label={m.loading({ report: label })} rows={8} />;
  if (query.isError && totalItems === undefined) {
    return (
      <ErrorState
        title={m.loadError({ report: label })}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (totalItems === 0) {
    return filtered ? (
      <EmptyState
        title={m.noMatches}
        description={m.noMatchesText}
        action={
          <Button variant="secondary" onClick={onClearFilters}>
            {m.clearFilters}
          </Button>
        }
      />
    ) : (
      <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {query.isError && (
        <ErrorState
          title={m.refreshError({ report: label })}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isFetching && query.isPlaceholderData && (
        <Spinner size="sm" label={m.updating} className="text-muted-foreground" />
      )}
      {children}
      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        totalItems={totalItems ?? 0}
        disabled={query.isPlaceholderData}
        onPageChange={onPageChange}
      />
    </div>
  );
}

/**
 * Customer filter of the sales and orders reports: the shared customer
 * search (server-side, paged), including archived customers (their orders
 * are history). The URL keeps only the id; the name is looked up.
 */
export function ReportCustomerFilter({
  control,
  customerId,
  onChange,
}: {
  control: FieldControlProps;
  customerId: string;
  onChange: (customerId: string) => void;
}) {
  const { organization } = useCurrentOrganization();
  const m = useMessages(insights).reports;
  const customer = useCustomer(organization.id, customerId);
  const found = customerId ? customer.data?.customer : undefined;
  const selected = found
    ? { id: found.id, name: found.name, companyName: found.companyName, isActive: found.isActive }
    : customerId
      ? {
          id: customerId,
          name: customer.isError ? m.unknownCustomer : '…',
          companyName: null,
          isActive: true,
        }
      : null;
  return (
    <CustomerPicker
      key={customerId || 'none'}
      control={control}
      includeArchived
      selected={selected}
      onChange={(next) => onChange(next?.id ?? '')}
      placeholder={m.allCustomers}
    />
  );
}
