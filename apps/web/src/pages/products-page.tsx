import type { ProductListItem } from '@app/shared';
import { PackageSearch, Plus, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/layout/page-state';
import { PaginationBar } from '@/components/layout/pagination-bar';
import { Can } from '@/components/organization/can';
import { ArchiveProductDialog } from '@/components/products/archive-product-dialog';
import { ProductActions } from '@/components/products/product-actions';
import { ProductStatusBadge } from '@/components/products/product-status-badge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
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
import { useCategories, useProducts, useProductStatusChange } from '@/hooks/use-catalog';
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { catalog } from '@/i18n/messages/catalog';
import { common } from '@/i18n/messages/common';
import { useApiErrorMessage } from '@/lib/api-errors';
import { pageTitle } from '@/lib/app-config';
import { cn } from '@/lib/cn';
import { useCurrentOrganization } from '@/lib/organization-context';
import {
  hasActiveFilters,
  type ProductListParams,
  readProductListParams,
  SORT_OPTIONS,
  toProductListQuery,
  writeProductListParams,
} from '@/lib/product-list-params';
import { paths } from '@/routes/paths';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Product catalog: server-side search, filters, sorting, and pagination. All
 * list state is kept in the URL.
 */
export function ProductsPage() {
  const { organization } = useCurrentOrganization();
  const m = useMessages(catalog).products;
  const c = useMessages(common);
  const errorMessage = useApiErrorMessage();
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readProductListParams(searchParams);
  const products = useProducts(organization.id, toProductListQuery(params));
  const categories = useCategories(organization.id);
  const statusChange = useProductStatusChange(organization.id);
  const [searchInput, setSearchInput] = useState(params.search);
  const [archiveTarget, setArchiveTarget] = useState<ProductListItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const changeStatus = (product: ProductListItem, action: 'archive' | 'restore') => {
    setNotice(null);
    statusChange.mutate(
      { productId: product.id, action },
      {
        onSuccess: () => {
          setArchiveTarget(null);
          setNotice(
            action === 'archive'
              ? m.archived({ name: product.name })
              : m.restored({ name: product.name }),
          );
        },
      },
    );
  };

  /** Archiving asks for confirmation first; restoring happens right away. */
  const onStatusChange = (product: ProductListItem, action: 'archive' | 'restore') => {
    if (action === 'archive') {
      statusChange.reset();
      setArchiveTarget(product);
    } else {
      changeStatus(product, action);
    }
  };

  const setParams = (changes: Partial<ProductListParams>) =>
    setSearchParams(writeProductListParams({ ...params, page: 1, ...changes }), {
      replace: true,
    });

  // Debounce typing into the URL (and therefore the API request); a new search starts at page 1.
  useEffect(() => {
    if (searchInput.trim() === params.search.trim()) return;
    const timeout = setTimeout(() => {
      setSearchParams(
        (current) =>
          writeProductListParams({
            ...readProductListParams(current),
            search: searchInput,
            page: 1,
          }),
        { replace: true },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchInput, params.search, setSearchParams]);

  const clearFilters = () => {
    setSearchInput('');
    setSearchParams(
      writeProductListParams({ ...params, search: '', categoryId: '', status: '', page: 1 }),
      {
        replace: true,
      },
    );
  };

  const filtered = hasActiveFilters(params);
  const data = products.data;

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`${m.title} · ${organization.name}`)}</title>
      <PageHeader
        title={m.title}
        description={m.description}
        actions={
          <Can permission="PRODUCTS_CREATE">
            <Link to={paths.productNew(organization.id)} className={buttonVariants()}>
              <Plus aria-hidden="true" />
              {m.add}
            </Link>
          </Can>
        }
      />

      <search className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput
          wrapperClassName="lg:max-w-sm lg:flex-1"

          aria-label={m.search}
          placeholder={m.searchPlaceholder}
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex lg:flex-none">
          <Select
            aria-label={m.category}
            wrapperClassName="lg:w-44"
            value={params.categoryId}
            onChange={(event) => setParams({ categoryId: event.target.value })}
          >
            <option value="">{m.allCategories}</option>
            {categories.data?.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label={m.status}
            wrapperClassName="lg:w-36"
            value={params.status}
            onChange={(event) =>
              setParams({ status: event.target.value as ProductListParams['status'] })
            }
          >
            <option value="">{m.allStatuses}</option>
            <option value="ACTIVE">{c.status.active}</option>
            <option value="ARCHIVED">{c.status.archived}</option>
          </Select>
          <Select
            aria-label={m.sort}
            wrapperClassName="lg:w-52"
            value={params.sort}
            onChange={(event) =>
              setParams({ sort: event.target.value as ProductListParams['sort'] })
            }
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {m.sortOptions[option]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2 lg:ml-auto">
          {products.isFetching && !products.isPending && (
            <Spinner size="sm" label={m.updating} className="text-muted-foreground" />
          )}
          {filtered && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X aria-hidden="true" />
              {c.actions.clearFilters}
            </Button>
          )}
        </div>
      </search>

      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {statusChange.isError && !archiveTarget && (
        <Alert tone="danger">{errorMessage(statusChange.error)}</Alert>
      )}

      {products.isPending && <ListSkeleton label={m.loading} />}

      {products.isError && (
        <ErrorState
          title={m.loadError}
          error={products.error}
          onRetry={() => void products.refetch()}
        />
      )}

      {data && data.pagination.totalItems === 0 && !filtered && (
        <EmptyState
          icon={<PackageSearch className="size-5" aria-hidden="true" />}
          title={m.emptyTitle}
          description={m.emptyText}
          action={
            <Can permission="PRODUCTS_CREATE">
              <Link to={paths.productNew(organization.id)} className={buttonVariants()}>
                <Plus aria-hidden="true" />
                {m.add}
              </Link>
            </Can>
          }
        />
      )}

      {data && data.pagination.totalItems === 0 && filtered && (
        <EmptyState
          icon={<Search className="size-5" aria-hidden="true" />}
          title={m.noMatches}
          action={
            <Button variant="secondary" onClick={clearFilters}>
              {c.actions.clearFilters}
            </Button>
          }
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <Card className={cn('overflow-hidden', products.isPlaceholderData && 'opacity-70')}>
            <ProductTable
              items={data.items}
              pendingId={statusChange.isPending ? statusChange.variables.productId : null}
              onStatusChange={onStatusChange}
            />
          </Card>
          <PaginationBar
            page={data.pagination.page}
            pageSize={data.pagination.pageSize}
            totalPages={data.pagination.totalPages}
            totalItems={data.pagination.totalItems}
            disabled={products.isPlaceholderData}
            onPageChange={(page) => setParams({ page })}
          />
        </>
      )}

      <ArchiveProductDialog
        product={archiveTarget}
        pending={statusChange.isPending}
        error={statusChange.isError ? statusChange.error : null}
        onConfirm={() => archiveTarget && changeStatus(archiveTarget, 'archive')}
        onCancel={() => setArchiveTarget(null)}
      />

      {data && data.items.length === 0 && data.pagination.totalItems > 0 && (
        <EmptyState
          title={m.pageEmpty}
          action={
            <Button variant="secondary" onClick={() => setParams({ page: 1 })}>
              {m.firstPage}
            </Button>
          }
        />
      )}
    </div>
  );
}

interface TableProps {
  items: ProductListItem[];
  pendingId: string | null;
  onStatusChange: (product: ProductListItem, action: 'archive' | 'restore') => void;
}

/** A table on large screens; stacked cards below `lg`, so nothing scrolls sideways. */
function ProductTable({ items, pendingId, onStatusChange }: TableProps) {
  const { organization } = useCurrentOrganization();
  const m = useMessages(catalog).products;
  const f = useFormat();

  return (
    <>
      <Table className="hidden @4xl:table">
        <TableHeader>
          <tr>
            <TableHead>{m.columns.product}</TableHead>
            <TableHead>{m.columns.sku}</TableHead>
            <TableHead>{m.columns.category}</TableHead>
            <TableHead align="right">{m.columns.price}</TableHead>
            <TableHead align="right">{m.columns.cost}</TableHead>
            <TableHead align="right" className="whitespace-nowrap">
              {m.columns.minimumStock}
            </TableHead>
            <TableHead>{m.columns.status}</TableHead>
            <TableHead align="right">
              <span className="sr-only">{m.columns.actions}</span>
            </TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {items.map((product) => (
            <TableRow
              key={product.id}
              className={cn(product.status === 'ARCHIVED' && 'text-muted-foreground')}
            >
              <TableCell className="max-w-64">
                <Link
                  to={paths.product(organization.id, product.id)}
                  className="block truncate rounded-sm font-medium text-foreground focus-ring hover:underline"
                >
                  {product.name}
                </Link>
              </TableCell>
              <TableCell className="font-mono text-xs whitespace-nowrap">{product.sku}</TableCell>
              <TableCell className="max-w-40 truncate whitespace-nowrap">
                {product.category?.name ?? <span className="text-subtle-foreground">—</span>}
              </TableCell>
              <TableCell align="right" className="whitespace-nowrap">
                {f.money(product.price, product.currency)}
              </TableCell>
              <TableCell align="right" className="whitespace-nowrap">
                {f.money(product.cost, product.currency)}
              </TableCell>
              <TableCell align="right">{f.number(product.minimumStock)}</TableCell>
              <TableCell>
                <ProductStatusBadge status={product.status} />
              </TableCell>
              <TableCell className="py-2">
                <ProductActions
                  product={product}
                  pending={pendingId === product.id}
                  onStatusChange={(action) => onStatusChange(product, action)}
                  compact
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="divide-y divide-border @4xl:hidden" aria-label={m.list}>
        {items.map((product) => (
          <li key={product.id} className="flex flex-col gap-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  to={paths.product(organization.id, product.id)}
                  className="block truncate rounded-sm font-medium focus-ring hover:underline"
                >
                  {product.name}
                </Link>
                <p className="truncate font-mono text-xs text-muted-foreground">{product.sku}</p>
              </div>
              <ProductStatusBadge status={product.status} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">{m.columns.category}</dt>
                <dd className="truncate">{product.category?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{m.columns.price}</dt>
                <dd className="tabular-nums">{f.money(product.price, product.currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{m.columns.cost}</dt>
                <dd className="tabular-nums">{f.money(product.cost, product.currency)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{m.columns.minimumStock}</dt>
                <dd className="tabular-nums">{f.number(product.minimumStock)}</dd>
              </div>
            </dl>
            <ProductActions
              product={product}
              pending={pendingId === product.id}
              onStatusChange={(action) => onStatusChange(product, action)}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
