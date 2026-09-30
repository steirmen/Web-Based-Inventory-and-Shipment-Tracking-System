import {
  CATALOG_LIMITS,
  type CreateCategoryRequest,
  type CreateProductRequest,
  MONEY_PATTERN,
  type Product,
  SKU_PATTERN,
  type UpdateCategoryRequest,
  type UpdateProductRequest,
} from '@app/shared';
import type { FieldErrors } from './auth-form';

/**
 * Client-side validation and request building for the product and category
 * forms. It catches obvious mistakes early; the API remains the authority.
 * Money stays a string from the input to the request body — it is never
 * parsed into a floating-point number.
 */

const L = CATALOG_LIMITS;

/** Form state: every field is the raw text of its input. */
export interface ProductFormValues {
  name: string;
  sku: string;
  description: string;
  categoryId: string;
  price: string;
  cost: string;
  minimumStock: string;
}

export type ProductField = keyof ProductFormValues;

export const PRODUCT_FIELDS: readonly ProductField[] = [
  'name',
  'sku',
  'description',
  'categoryId',
  'price',
  'cost',
  'minimumStock',
];

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: '',
  sku: '',
  description: '',
  categoryId: '',
  price: '',
  cost: '',
  minimumStock: '0',
};

export function productToFormValues(product: Product): ProductFormValues {
  return {
    name: product.name,
    sku: product.sku,
    description: product.description ?? '',
    categoryId: product.category?.id ?? '',
    price: product.price,
    cost: product.cost ?? '',
    minimumStock: String(product.minimumStock),
  };
}

const collapse = (value: string) => value.trim().replace(/\s+/g, ' ');

function validateMoney(value: string, label: string): string | undefined {
  const amount = value.trim();
  if (!amount) return `Enter a ${label.toLowerCase()}.`;
  if (!MONEY_PATTERN.test(amount)) {
    return `${label} must be a non-negative amount with up to 2 decimals (e.g. 19.99).`;
  }
  return undefined;
}

/**
 * `costOptional` is set when editing a legacy product that has no cost yet:
 * leaving it blank keeps it unset.
 */
export function validateProduct(
  values: ProductFormValues,
  options: { costOptional?: boolean } = {},
): FieldErrors<ProductField> {
  const name = collapse(values.name);
  const sku = values.sku.trim();
  const minimumStock = values.minimumStock.trim();

  return {
    name: !name
      ? 'Enter a product name.'
      : name.length > L.productNameMaxLength
        ? `Use at most ${L.productNameMaxLength} characters.`
        : undefined,
    sku: !sku
      ? 'Enter a SKU.'
      : sku.length > L.skuMaxLength
        ? `Use at most ${L.skuMaxLength} characters.`
        : !SKU_PATTERN.test(sku)
          ? 'Use letters, numbers, and . _ - / (starting with a letter or number).'
          : undefined,
    description:
      values.description.trim().length > L.productDescriptionMaxLength
        ? `Use at most ${L.productDescriptionMaxLength} characters.`
        : undefined,
    price: validateMoney(values.price, 'Price'),
    cost:
      options.costOptional && !values.cost.trim() ? undefined : validateMoney(values.cost, 'Cost'),
    minimumStock: !minimumStock
      ? 'Enter a minimum stock level (0 for none).'
      : !/^\d+$/.test(minimumStock)
        ? 'Minimum stock must be a whole number of 0 or more.'
        : Number(minimumStock) > L.minimumStockMax
          ? `Minimum stock must be at most ${L.minimumStockMax.toLocaleString()}.`
          : undefined,
  };
}

export function toCreateProductRequest(values: ProductFormValues): CreateProductRequest {
  return {
    name: collapse(values.name),
    sku: values.sku.trim(),
    description: values.description.trim() || null,
    categoryId: values.categoryId || null,
    price: values.price.trim(),
    cost: values.cost.trim(),
    minimumStock: Number(values.minimumStock.trim()),
  };
}

/** Only the fields that differ from the loaded product (an empty object means "nothing changed"). */
export function toUpdateProductRequest(
  initial: ProductFormValues,
  values: ProductFormValues,
): UpdateProductRequest {
  const next = toCreateProductRequest(values);
  const before = toCreateProductRequest(initial);
  const changes: UpdateProductRequest = {};
  if (next.name !== before.name) changes.name = next.name;
  if (next.sku !== before.sku) changes.sku = next.sku;
  if (next.description !== before.description) changes.description = next.description;
  if (next.categoryId !== before.categoryId) changes.categoryId = next.categoryId;
  if (next.price !== before.price) changes.price = next.price;
  // A legacy product without a cost keeps it unset while the field stays blank.
  if (next.cost !== before.cost && next.cost !== '') changes.cost = next.cost;
  if (next.minimumStock !== before.minimumStock) changes.minimumStock = next.minimumStock;
  return changes;
}

// --- Categories ------------------------------------------------------------------

export interface CategoryFormValues {
  name: string;
  description: string;
}

export type CategoryField = keyof CategoryFormValues;

export const CATEGORY_FIELDS: readonly CategoryField[] = ['name', 'description'];

export function validateCategory(values: CategoryFormValues): FieldErrors<CategoryField> {
  const name = collapse(values.name);
  return {
    name: !name
      ? 'Enter a category name.'
      : name.length > L.categoryNameMaxLength
        ? `Use at most ${L.categoryNameMaxLength} characters.`
        : undefined,
    description:
      values.description.trim().length > L.categoryDescriptionMaxLength
        ? `Use at most ${L.categoryDescriptionMaxLength} characters.`
        : undefined,
  };
}

export function toCategoryRequest(
  values: CategoryFormValues,
): CreateCategoryRequest & UpdateCategoryRequest {
  return { name: collapse(values.name), description: values.description.trim() || null };
}
