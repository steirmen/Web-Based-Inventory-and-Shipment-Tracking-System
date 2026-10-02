import {
  CATALOG_LIMITS,
  type CreateCategoryRequest,
  type CreateProductRequest,
  type Currency,
  DEFAULT_CURRENCY,
  MONEY_PATTERN,
  type Product,
  SKU_PATTERN,
  type UpdateCategoryRequest,
  type UpdateProductRequest,
} from '@app/shared';
import type { Translation } from '@/i18n/define';
import type { catalog } from '@/i18n/messages/catalog';
import type { FieldErrors } from './auth-form';

type Validation = Translation<typeof catalog.en>['validation'];

/**
 * Client-side validation and request building for the product and category
 * forms. It catches obvious mistakes early; the API remains the authority.
 * Money stays a string from the input to the request body — it is never
 * parsed into a floating-point number. Price and cost share the product's
 * one currency. Messages come from the current language.
 */

const L = CATALOG_LIMITS;

/** Form state: every field is the raw text of its input. */
export interface ProductFormValues {
  name: string;
  sku: string;
  description: string;
  categoryId: string;
  /** The selected category's name, for display only (never sent). */
  categoryName: string;
  price: string;
  cost: string;
  currency: Currency;
  minimumStock: string;
}

export type ProductField = Exclude<keyof ProductFormValues, 'categoryName'>;

export const PRODUCT_FIELDS: readonly ProductField[] = [
  'name',
  'sku',
  'description',
  'categoryId',
  'price',
  'cost',
  'currency',
  'minimumStock',
];

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  name: '',
  sku: '',
  description: '',
  categoryId: '',
  categoryName: '',
  price: '',
  cost: '',
  currency: DEFAULT_CURRENCY,
  minimumStock: '0',
};

export function productToFormValues(product: Product): ProductFormValues {
  return {
    name: product.name,
    sku: product.sku,
    description: product.description ?? '',
    categoryId: product.category?.id ?? '',
    categoryName: product.category?.name ?? '',
    price: product.price,
    cost: product.cost ?? '',
    currency: product.currency,
    minimumStock: String(product.minimumStock),
  };
}

const collapse = (value: string) => value.trim().replace(/\s+/g, ' ');

function validateMoney(
  value: string,
  messages: { required: string; invalid: string },
): string | undefined {
  const amount = value.trim();
  if (!amount) return messages.required;
  if (!MONEY_PATTERN.test(amount)) return messages.invalid;
  return undefined;
}

/**
 * `costOptional` is set when editing a legacy product that has no cost yet:
 * leaving it blank keeps it unset.
 */
export function validateProduct(
  values: ProductFormValues,
  m: Validation,
  options: { costOptional?: boolean; formatNumber?: (value: number) => string } = {},
): FieldErrors<ProductField> {
  const formatNumber = options.formatNumber ?? ((value: number) => value.toLocaleString('en-US'));
  const name = collapse(values.name);
  const sku = values.sku.trim();
  const minimumStock = values.minimumStock.trim();

  return {
    name: !name ? m.nameRequired : name.length > L.productNameMaxLength ? m.nameTooLong : undefined,
    sku: !sku
      ? m.skuRequired
      : sku.length > L.skuMaxLength
        ? m.skuTooLong
        : !SKU_PATTERN.test(sku)
          ? m.skuPattern
          : undefined,
    description:
      values.description.trim().length > L.productDescriptionMaxLength
        ? m.descriptionTooLong
        : undefined,
    price: validateMoney(values.price, { required: m.priceRequired, invalid: m.priceInvalid }),
    cost:
      options.costOptional && !values.cost.trim()
        ? undefined
        : validateMoney(values.cost, { required: m.costRequired, invalid: m.costInvalid }),
    minimumStock: !minimumStock
      ? m.minimumStockRequired
      : !/^\d+$/.test(minimumStock)
        ? m.minimumStockInvalid
        : Number(minimumStock) > L.minimumStockMax
          ? m.minimumStockTooLarge({ max: formatNumber(L.minimumStockMax) })
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
    currency: values.currency,
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
  if (next.currency !== before.currency) changes.currency = next.currency;
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

export function validateCategory(
  values: CategoryFormValues,
  m: Validation,
): FieldErrors<CategoryField> {
  const name = collapse(values.name);
  return {
    name: !name
      ? m.categoryNameRequired
      : name.length > L.categoryNameMaxLength
        ? m.categoryNameTooLong
        : undefined,
    description:
      values.description.trim().length > L.categoryDescriptionMaxLength
        ? m.categoryDescriptionTooLong
        : undefined,
  };
}

/** A category name as the API stores it (trimmed, inner spaces collapsed). */
export const normalizeCategoryName = collapse;

export function toCategoryRequest(
  values: CategoryFormValues,
): CreateCategoryRequest & UpdateCategoryRequest {
  return { name: collapse(values.name), description: values.description.trim() || null };
}
