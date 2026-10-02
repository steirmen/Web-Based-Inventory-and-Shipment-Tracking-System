/**
 * Products & categories API contract.
 *
 * Money is always a decimal STRING with two fraction digits ("99.99", "0.00"),
 * matching the database NUMERIC(12,2) columns exactly. Never convert it to a
 * binary floating-point number for storage or arithmetic. Every product has
 * one currency for its price and cost (docs/currency.md).
 */

import type { Currency } from './currency.js';

export const PRODUCT_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Input limits shared by API validation and client-side form validation. */
export const CATALOG_LIMITS = {
  categoryNameMaxLength: 100,
  categoryDescriptionMaxLength: 500,
  productNameMaxLength: 200,
  skuMaxLength: 64,
  productDescriptionMaxLength: 2000,
  minimumStockMax: 1_000_000_000,
  searchMaxLength: 100,
  pageSizeDefault: 20,
  pageSizeMax: 100,
  /** Results of a category search (`GET …/categories?search=`). */
  categorySearchMax: 20,
} as const;

/**
 * A non-negative amount with at most 10 integer digits and 2 decimals — what
 * fits NUMERIC(12,2). No sign, exponent, or thousands separators.
 */
export const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

/** Letters, digits, and `. _ - /` (not at the start). Case is preserved. */
export const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/;

// --- Categories ------------------------------------------------------------------

export interface Category {
  id: string;
  name: string;
  description: string | null;
  /** Products (active and archived) assigned to this category. */
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryListResponse {
  categories: Category[];
}

/** `GET …/categories` query. Without `search`: every category, newest first. */
export interface CategoryListQuery {
  /**
   * Case-insensitive match on the name: at most `categorySearchMax` results,
   * exact (case-insensitive) matches first, then by name.
   */
  search?: string;
}

export interface CategoryResponse {
  category: Category;
}

export interface CreateCategoryRequest {
  name: string;
  description?: string | null;
}

export type UpdateCategoryRequest = Partial<CreateCategoryRequest>;

// --- Products ----------------------------------------------------------------------

export interface ProductCategoryRef {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  /** Decimal string, e.g. "99.99". */
  price: string;
  /** Decimal string; null only for legacy records created without a cost. */
  cost: string | null;
  /** The currency of both price and cost. */
  currency: Currency;
  minimumStock: number;
  status: ProductStatus;
  category: ProductCategoryRef | null;
  createdAt: string;
  updatedAt: string;
}

/** Product as shown in lists (without the long description). */
export type ProductListItem = Omit<Product, 'description'>;

export interface ProductResponse {
  product: Product;
}

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ProductListResponse {
  items: ProductListItem[];
  pagination: Pagination;
}

/** Whitelisted sort fields for `GET …/products?sortBy=`. */
export const PRODUCT_SORT_FIELDS = [
  'name',
  'sku',
  'price',
  'cost',
  'minimumStock',
  'createdAt',
  'updatedAt',
] as const;
export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

/** Query parameters of `GET /organizations/:id/products`. */
export interface ProductListQuery {
  /** Case-insensitive match on name or SKU. */
  search?: string;
  categoryId?: string;
  status?: ProductStatus;
  /** Default `createdAt`. */
  sortBy?: ProductSortField;
  /** Default `desc`. */
  sortOrder?: SortOrder;
  /** 1-based, default 1. */
  page?: number;
  /** Default 20, maximum 100. */
  pageSize?: number;
}

export interface CreateProductRequest {
  name: string;
  sku: string;
  description?: string | null;
  categoryId?: string | null;
  /** Decimal string (MONEY_PATTERN). */
  price: string;
  /** Decimal string (MONEY_PATTERN). */
  cost: string;
  /** Currency of price and cost. Default DEFAULT_CURRENCY (TRY). */
  currency?: Currency;
  minimumStock: number;
}

/** Status is NOT updatable here — use the archive/restore endpoints. */
export type UpdateProductRequest = Partial<CreateProductRequest>;
