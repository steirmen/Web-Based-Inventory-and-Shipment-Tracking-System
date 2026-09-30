import {
  CATALOG_LIMITS,
  PRODUCT_SORT_FIELDS,
  PRODUCT_STATUSES,
  type ProductListQuery,
  type ProductSortField,
  type ProductStatus,
  type SortOrder,
} from '@app/shared';
import { paths } from '@/routes/paths';

/**
 * Product list state lives in the URL (?search=&category=&status=&sort=&page=)
 * so it survives reloads and back/forward navigation. Unknown values are
 * ignored here; the API validates everything again.
 */
export interface ProductListParams {
  search: string;
  categoryId: string;
  status: ProductStatus | '';
  sort: SortValue;
  page: number;
}

type SortValue = `${ProductSortField}:${SortOrder}`;

export const DEFAULT_SORT: SortValue = 'createdAt:desc';

export const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'updatedAt:desc', label: 'Recently updated' },
  { value: 'name:asc', label: 'Name (A–Z)' },
  { value: 'name:desc', label: 'Name (Z–A)' },
  { value: 'sku:asc', label: 'SKU (A–Z)' },
  { value: 'price:asc', label: 'Price (low to high)' },
  { value: 'price:desc', label: 'Price (high to low)' },
  { value: 'cost:asc', label: 'Cost (low to high)' },
  { value: 'cost:desc', label: 'Cost (high to low)' },
  { value: 'minimumStock:desc', label: 'Minimum stock (high to low)' },
];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isSortValue(value: string): value is SortValue {
  const [field, order] = value.split(':');
  return (
    (PRODUCT_SORT_FIELDS as readonly string[]).includes(field ?? '') &&
    (order === 'asc' || order === 'desc')
  );
}

export function readProductListParams(searchParams: URLSearchParams): ProductListParams {
  const status = searchParams.get('status') ?? '';
  const sort = searchParams.get('sort') ?? '';
  const categoryId = searchParams.get('category') ?? '';
  const page = Number(searchParams.get('page'));

  return {
    search: (searchParams.get('search') ?? '').slice(0, CATALOG_LIMITS.searchMaxLength),
    categoryId: UUID_PATTERN.test(categoryId) ? categoryId : '',
    status: (PRODUCT_STATUSES as readonly string[]).includes(status)
      ? (status as ProductStatus)
      : '',
    sort: isSortValue(sort) ? sort : DEFAULT_SORT,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** Writes only non-default values, keeping URLs short. */
export function writeProductListParams(params: ProductListParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (params.search.trim()) searchParams.set('search', params.search.trim());
  if (params.categoryId) searchParams.set('category', params.categoryId);
  if (params.status) searchParams.set('status', params.status);
  if (params.sort !== DEFAULT_SORT) searchParams.set('sort', params.sort);
  if (params.page > 1) searchParams.set('page', String(params.page));
  return searchParams;
}

export function toProductListQuery(params: ProductListParams): ProductListQuery {
  const [sortBy, sortOrder] = params.sort.split(':') as [ProductSortField, SortOrder];
  return {
    ...(params.search.trim() ? { search: params.search.trim() } : {}),
    ...(params.categoryId ? { categoryId: params.categoryId } : {}),
    ...(params.status ? { status: params.status } : {}),
    sortBy,
    sortOrder,
    page: params.page,
    pageSize: CATALOG_LIMITS.pageSizeDefault,
  };
}

export function hasActiveFilters(params: ProductListParams): boolean {
  return Boolean(params.search.trim() || params.categoryId || params.status);
}

/** The product list filtered to one category (used from the Categories page). */
export function categoryProductsPath(organizationId: string, categoryId: string): string {
  const query = writeProductListParams({
    search: '',
    categoryId,
    status: '',
    sort: DEFAULT_SORT,
    page: 1,
  });
  return `${paths.products(organizationId)}?${query.toString()}`;
}
