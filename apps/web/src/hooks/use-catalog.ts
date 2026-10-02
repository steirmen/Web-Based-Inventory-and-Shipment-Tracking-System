import type {
  CreateCategoryRequest,
  CreateProductRequest,
  ProductListQuery,
  ProductResponse,
  UpdateCategoryRequest,
  UpdateProductRequest,
} from '@app/shared';
import {
  keepPreviousData,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  archiveProduct,
  catalogKeys,
  createCategory,
  createProduct,
  deleteCategory,
  getProduct,
  listCategories,
  searchCategories,
  listProducts,
  restoreProduct,
  updateCategory,
  updateProduct,
} from '@/api/catalog';
import { refreshAccessOnDenial } from './use-organizations';

/**
 * All catalog keys include the organization id, so data from one workspace is
 * never served while viewing another, and every mutation below only touches
 * the caches of the organization it was created for.
 */

/** One server-side page of products. The previous page stays visible while the next loads. */
export function useProducts(organizationId: string, query: ProductListQuery) {
  return useQuery({
    queryKey: catalogKeys.productList(organizationId, query),
    queryFn: ({ signal }) => listProducts(organizationId, query, { signal }),
    placeholderData: keepPreviousData,
  });
}

/** One product. 404 = unknown, malformed, or in another organization. */
export function useProduct(organizationId: string, productId: string) {
  return useQuery({
    queryKey: catalogKeys.product(organizationId, productId),
    queryFn: ({ signal }) => getProduct(organizationId, productId, { signal }),
    retry: false,
  });
}

export function useCategories(organizationId: string) {
  return useQuery({
    queryKey: catalogKeys.categories(organizationId),
    queryFn: ({ signal }) => listCategories(organizationId, { signal }),
  });
}

/**
 * Server-side category search for the product form's picker. An empty term
 * lists every category (the plain list); results stay visible while the next
 * search loads.
 */
export function useCategorySearch(organizationId: string, search: string, enabled = true) {
  const term = search.trim();
  return useQuery({
    queryKey: term
      ? catalogKeys.categorySearch(organizationId, term)
      : catalogKeys.categories(organizationId),
    queryFn: ({ signal }) =>
      term
        ? searchCategories(organizationId, term, { signal })
        : listCategories(organizationId, { signal }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** A product changed: cache it, and refresh lists and category counts. */
function onProductSaved(queryClient: QueryClient, organizationId: string, data: ProductResponse) {
  queryClient.setQueryData(catalogKeys.product(organizationId, data.product.id), data);
  void queryClient.invalidateQueries({
    queryKey: catalogKeys.products(organizationId),
    // The detail entry was just set from the response; refetching it is unnecessary.
    predicate: (query) => query.queryKey.at(-2) !== 'item',
  });
  void queryClient.invalidateQueries({ queryKey: catalogKeys.categories(organizationId) });
}

export function useCreateProduct(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProductRequest) => createProduct(organizationId, body),
    onSuccess: (data) => onProductSaved(queryClient, organizationId, data),
    onError: (error) => refreshAccessOnDenial(queryClient, organizationId, error),
  });
}

export function useUpdateProduct(organizationId: string, productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProductRequest) => updateProduct(organizationId, productId, body),
    onSuccess: (data) => onProductSaved(queryClient, organizationId, data),
    onError: (error) => {
      refreshAccessOnDenial(queryClient, organizationId, error);
      // e.g. PRODUCT_ARCHIVED: someone archived it meanwhile — show the current state.
      void queryClient.invalidateQueries({
        queryKey: catalogKeys.product(organizationId, productId),
      });
    },
  });
}

/** Archive or restore; refreshes every product list and the product itself. */
export function useProductStatusChange(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, action }: { productId: string; action: 'archive' | 'restore' }) =>
      action === 'archive'
        ? archiveProduct(organizationId, productId)
        : restoreProduct(organizationId, productId),
    onSuccess: (data) => onProductSaved(queryClient, organizationId, data),
    onError: (error) => refreshAccessOnDenial(queryClient, organizationId, error),
  });
}

/** Category changes also refresh products, which show the category name. */
function onCategoriesChanged(queryClient: QueryClient, organizationId: string) {
  void queryClient.invalidateQueries({ queryKey: catalogKeys.categories(organizationId) });
  void queryClient.invalidateQueries({ queryKey: catalogKeys.products(organizationId) });
}

export function useCreateCategory(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCategoryRequest) => createCategory(organizationId, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: catalogKeys.categories(organizationId) }),
    onError: (error) => refreshAccessOnDenial(queryClient, organizationId, error),
  });
}

export function useUpdateCategory(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, body }: { categoryId: string; body: UpdateCategoryRequest }) =>
      updateCategory(organizationId, categoryId, body),
    onSuccess: () => onCategoriesChanged(queryClient, organizationId),
    onError: (error) => refreshAccessOnDenial(queryClient, organizationId, error),
  });
}

export function useDeleteCategory(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) => deleteCategory(organizationId, categoryId),
    onSuccess: () => onCategoriesChanged(queryClient, organizationId),
    onError: (error) => {
      refreshAccessOnDenial(queryClient, organizationId, error);
      // CATEGORY_IN_USE / CATEGORY_NOT_FOUND: the list is out of date.
      void queryClient.invalidateQueries({ queryKey: catalogKeys.categories(organizationId) });
    },
  });
}
