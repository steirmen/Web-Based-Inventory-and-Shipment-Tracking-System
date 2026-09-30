import type { ProductListItem } from '@app/shared';
import { PackageSearch, Plus, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/page-state';
import { PaginationBar } from '@/components/layout/pagination-bar';
import { Can } from '@/components/organization/can';
import { ArchiveProductDialog } from '@/components/products/archive-product-dialog';
import { ProductActions } from '@/components/products/product-actions';
import { ProductStatusBadge } from '@/components/products/product-status-badge';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { useCategories, useProducts, useProductStatusChange } from '@/hooks/use-catalog';
import { apiErrorMessage } from '@/lib/api-errors';
import { pageTitle } from '@/lib/app-config';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';
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
            action === 'archive' ? `${product.name} archived.` : `${product.name} restored.`,
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
      <title>{pageTitle(`Products · ${organization.name}`)}</title>
      <PageHeader
        title="Products"
        description="Everything your business sells, with prices and reorder levels."
        actions={
          <Can permission="PRODUCTS_CREATE">
            <Link to={paths.productNew(organization.id)} className={buttonVariants()}>
              <Plus aria-hidden="true" />
              Add product
            </Link>
          </Can>
        }
      />

      <search className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:max-w-sm lg:flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search products"
            placeholder="Search products by name or SKU…"
            className="pl-9"
            maxLength={100}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex lg:flex-none">
          <Select
            aria-label="Category"
            wrapperClassName="lg:w-44"
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
          <Select
            aria-label="Status"
            wrapperClassName="lg:w-36"
            value={params.status}
            onChange={(event) =>
              setParams({ status: event.target.value as ProductListParams['status'] })
            }
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
          <Select
            aria-label="Sort"
            wrapperClassName="lg:w-52"
            value={params.sort}
            onChange={(event) =>
              setParams({ sort: event.target.value as ProductListParams['sort'] })
            }
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2 lg:ml-auto">
          {products.isFetching && !products.isPending && (
            <Spinner size="sm" label="Updating results" className="text-muted-foreground" />
          )}
          {filtered && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X aria-hidden="true" />
              Clear filters
            </Button>
          )}
        </div>
      </search>

      {notice && <Alert tone="success">{notice}</Alert>}
      {statusChange.isError && !archiveTarget && (
        <Alert tone="danger">{apiErrorMessage(statusChange.error)}</Alert>
      )}

      {products.isPending && <LoadingState label="Loading products" />}

      {products.isError && (
        <ErrorState
          title="We couldn't load products"
          error={products.error}
          onRetry={() => void products.refetch()}
        />
      )}

      {data && data.pagination.totalItems === 0 && !filtered && (
        <EmptyState
          icon={<PackageSearch className="size-5" aria-hidden="true" />}
          title="No products yet"
          description="Create your first product."
          action={
            <Can permission="PRODUCTS_CREATE">
              <Link to={paths.productNew(organization.id)} className={buttonVariants()}>
                <Plus aria-hidden="true" />
                Add product
              </Link>
            </Can>
          }
        />
      )}

      {data && data.pagination.totalItems === 0 && filtered && (
        <EmptyState
          icon={<Search className="size-5" aria-hidden="true" />}
          title="No products match your filters."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
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
          title="This page is empty."
          action={
            <Button variant="secondary" onClick={() => setParams({ page: 1 })}>
              Go to the first page
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

  return (
    <>
      <table className="hidden w-full text-sm xl:table">
        <thead className="border-b border-border bg-surface-muted/60 text-left text-xs font-medium text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Product
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              SKU
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Category
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Price
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Cost
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Min.&nbsp;stock
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Status
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((product) => (
            <tr
              key={product.id}
              className={cn(product.status === 'ARCHIVED' && 'text-muted-foreground')}
            >
              <td className="max-w-64 px-4 py-3">
                <Link
                  to={paths.product(organization.id, product.id)}
                  className="block truncate rounded-sm font-medium text-foreground focus-ring hover:underline"
                >
                  {product.name}
                </Link>
              </td>
              <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{product.sku}</td>
              <td className="max-w-40 truncate px-4 py-3 whitespace-nowrap">
                {product.category?.name ?? <span className="text-subtle-foreground">—</span>}
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                {formatMoney(product.price)}
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                {formatMoney(product.cost)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{product.minimumStock}</td>
              <td className="px-4 py-3">
                <ProductStatusBadge status={product.status} />
              </td>
              <td className="px-4 py-2">
                <ProductActions
                  product={product}
                  pending={pendingId === product.id}
                  onStatusChange={(action) => onStatusChange(product, action)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-border xl:hidden" aria-label="Products">
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
                <dt className="text-xs text-muted-foreground">Category</dt>
                <dd className="truncate">{product.category?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Price</dt>
                <dd className="tabular-nums">{formatMoney(product.price)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Cost</dt>
                <dd className="tabular-nums">{formatMoney(product.cost)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Min. stock</dt>
                <dd className="tabular-nums">{product.minimumStock}</dd>
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
