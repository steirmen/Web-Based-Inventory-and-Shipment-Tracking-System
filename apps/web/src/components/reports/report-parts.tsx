import { REPORT_TYPES, type SortOrder } from '@app/shared';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search, X } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { NavLink } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/page-state';
import { PaginationBar } from '@/components/layout/pagination-bar';
import { Can } from '@/components/organization/can';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { apiErrorMessage } from '@/lib/api-errors';
import { cn } from '@/lib/cn';
import { REPORT_TITLES, reportPath, type ReportSort } from '@/lib/report-params';

/** Sales / Orders / Inventory. Sales and orders links keep the current date range. */
export function ReportTabs({
  organizationId,
  periodSearch,
}: {
  organizationId: string;
  /** `range=…&from=…&to=…` of the current page (kept when switching between dated reports). */
  periodSearch: string;
}) {
  return (
    <nav aria-label="Reports" className="flex gap-1 overflow-x-auto">
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
          {REPORT_TITLES[type]}
        </NavLink>
      ))}
    </nav>
  );
}

/** CSV export of the report as currently filtered and sorted (hidden without REPORTS_EXPORT; the API checks too). */
export function ExportButton({
  onExport,
  pending,
  error,
  disabled,
}: {
  onExport: () => void;
  pending: boolean;
  error: unknown;
  disabled?: boolean;
}) {
  return (
    <Can permission="REPORTS_EXPORT">
      <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
        <Button
          variant="secondary"
          onClick={onExport}
          isLoading={pending}
          disabled={disabled}
          className="w-full sm:w-auto"
        >
          {!pending && <Download aria-hidden="true" />}
          Export CSV
        </Button>
        {error ? (
          <Alert tone="danger" className="sm:max-w-sm">
            {apiErrorMessage(error)}
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
    <FormField label="Search">
      {(control) => (
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground"
            aria-hidden="true"
          />
          <Input
            {...control}
            type="search"
            placeholder={placeholder}
            className="pl-9"
            maxLength={100}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </div>
      )}
    </FormField>
  );
}

export function ClearFiltersButton({ onClear }: { onClear: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClear}>
      <X aria-hidden="true" />
      Clear filters
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
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-border bg-surface-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              {columns.map((column) => {
                const active = column.sort !== undefined && column.sort === sort.field;
                const Icon = !active ? ArrowUpDown : sort.order === 'asc' ? ArrowUp : ArrowDown;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      active ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                    className={cn(
                      'px-4 py-2.5 font-medium whitespace-nowrap',
                      column.align === 'right' && 'text-right',
                    )}
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
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-4 py-3',
                      column.align === 'right' && 'text-right tabular-nums',
                      column.className,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  if (query.isPending) return <LoadingState label={`Loading the ${label}`} />;
  if (query.isError && totalItems === undefined) {
    return (
      <ErrorState
        title={`We couldn't load the ${label}`}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (totalItems === 0) {
    return filtered ? (
      <EmptyState
        title="Nothing matches these filters."
        description="Try another search, or clear the filters."
        action={
          <Button variant="secondary" onClick={onClearFilters}>
            Clear filters
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
          title={`We couldn't refresh the ${label}`}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isFetching && query.isPlaceholderData && (
        <Spinner size="sm" label="Updating results" className="text-muted-foreground" />
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
