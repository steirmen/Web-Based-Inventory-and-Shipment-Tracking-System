import type { Category, Product, ProductListItem, ProductStatus } from '@app/shared';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Prisma `select` shapes and their mapping to the public API contract. Money
 * leaves the API as an exact two-decimal string (Decimal#toFixed), never as a
 * JavaScript number.
 */

export function toMoney(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

export const CATEGORY_SELECT = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { products: true } },
} as const;

export function toCategory(record: {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { products: number };
}): Category {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    productCount: record._count.products,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** List columns: the category is loaded in the same query (no N+1). */
export const PRODUCT_LIST_SELECT = {
  id: true,
  name: true,
  sku: true,
  price: true,
  cost: true,
  minimumStock: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
} as const;

export const PRODUCT_SELECT = { ...PRODUCT_LIST_SELECT, description: true } as const;

interface ProductListRecord {
  id: string;
  name: string;
  sku: string;
  price: Prisma.Decimal;
  cost: Prisma.Decimal | null;
  minimumStock: number;
  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
  category: { id: string; name: string } | null;
}

export function toProductListItem(record: ProductListRecord): ProductListItem {
  return {
    id: record.id,
    name: record.name,
    sku: record.sku,
    price: toMoney(record.price),
    cost: record.cost ? toMoney(record.cost) : null,
    minimumStock: record.minimumStock,
    status: record.status,
    category: record.category,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toProduct(record: ProductListRecord & { description: string | null }): Product {
  return { ...toProductListItem(record), description: record.description };
}
