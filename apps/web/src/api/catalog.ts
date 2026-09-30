import type {
  CategoryListResponse,
  CategoryResponse,
  CreateCategoryRequest,
  CreateProductRequest,
  ProductListQuery,
  ProductListResponse,
  ProductResponse,
  UpdateCategoryRequest,
  UpdateProductRequest,
} from '@app/shared';
import { apiRequest } from './http-client';
import { organizationKeys } from './organizations';

/** Catalog keys live under the organization, so organization-level invalidation reaches them. */
export const catalogKeys = {
  products: (organizationId: string) =>
    [...organizationKeys.detail(organizationId), 'products'] as const,
  productList: (organizationId: string, query: ProductListQuery) =>
    [...catalogKeys.products(organizationId), 'list', query] as const,
  product: (organizationId: string, productId: string) =>
    [...catalogKeys.products(organizationId), 'item', productId] as const,
  categories: (organizationId: string) =>
    [...organizationKeys.detail(organizationId), 'categories'] as const,
};

const base = (organizationId: string) => `/organizations/${encodeURIComponent(organizationId)}`;
const productPath = (organizationId: string, productId: string) =>
  `${base(organizationId)}/products/${encodeURIComponent(productId)}`;
const categoryPath = (organizationId: string, categoryId: string) =>
  `${base(organizationId)}/categories/${encodeURIComponent(categoryId)}`;

/** Serializes only the parameters that are set. Filtering, sorting, and paging happen on the server. */
function toSearchParams(query: ProductListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export function listProducts(
  organizationId: string,
  query: ProductListQuery,
  options?: { signal?: AbortSignal },
) {
  return apiRequest<ProductListResponse>(
    `${base(organizationId)}/products${toSearchParams(query)}`,
    { signal: options?.signal },
  );
}

export function getProduct(
  organizationId: string,
  productId: string,
  options?: { signal?: AbortSignal },
) {
  return apiRequest<ProductResponse>(productPath(organizationId, productId), {
    signal: options?.signal,
  });
}

export function createProduct(organizationId: string, body: CreateProductRequest) {
  return apiRequest<ProductResponse>(`${base(organizationId)}/products`, { method: 'POST', body });
}

export function updateProduct(
  organizationId: string,
  productId: string,
  body: UpdateProductRequest,
) {
  return apiRequest<ProductResponse>(productPath(organizationId, productId), {
    method: 'PATCH',
    body,
  });
}

export function archiveProduct(organizationId: string, productId: string) {
  return apiRequest<ProductResponse>(`${productPath(organizationId, productId)}/archive`, {
    method: 'POST',
  });
}

export function restoreProduct(organizationId: string, productId: string) {
  return apiRequest<ProductResponse>(`${productPath(organizationId, productId)}/restore`, {
    method: 'POST',
  });
}

export function listCategories(organizationId: string, options?: { signal?: AbortSignal }) {
  return apiRequest<CategoryListResponse>(`${base(organizationId)}/categories`, {
    signal: options?.signal,
  });
}

export function createCategory(organizationId: string, body: CreateCategoryRequest) {
  return apiRequest<CategoryResponse>(`${base(organizationId)}/categories`, {
    method: 'POST',
    body,
  });
}

export function updateCategory(
  organizationId: string,
  categoryId: string,
  body: UpdateCategoryRequest,
) {
  return apiRequest<CategoryResponse>(categoryPath(organizationId, categoryId), {
    method: 'PATCH',
    body,
  });
}

export function deleteCategory(organizationId: string, categoryId: string) {
  return apiRequest<void>(categoryPath(organizationId, categoryId), { method: 'DELETE' });
}
