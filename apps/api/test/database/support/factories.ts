import type { Prisma } from '../../../src/generated/prisma/client.js';
import { prisma } from './database.js';

/**
 * Minimal valid records for database tests. Each call gets unique names/codes;
 * pass overrides to set the fields a test cares about.
 */
let sequence = 0;
const next = (): number => ++sequence;

type Scoped<T> = Partial<Omit<T, 'organizationId'>>;

export function createUser(data: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  const n = next();
  return prisma.user.create({
    data: { name: `User ${n}`, email: `user${n}@test.example`, ...data },
  });
}

export function createOrganization(data: Partial<Prisma.OrganizationUncheckedCreateInput> = {}) {
  const n = next();
  return prisma.organization.create({
    data: { name: `Organization ${n}`, slug: `org-${n}`, ...data },
  });
}

export function createCategory(
  organizationId: string,
  data: Scoped<Prisma.CategoryUncheckedCreateInput> = {},
) {
  return prisma.category.create({ data: { organizationId, name: `Category ${next()}`, ...data } });
}

export function createProduct(
  organizationId: string,
  data: Scoped<Prisma.ProductUncheckedCreateInput> = {},
) {
  const n = next();
  return prisma.product.create({
    data: { organizationId, name: `Product ${n}`, sku: `SKU-${n}`, price: '10.00', ...data },
  });
}

export function createWarehouse(
  organizationId: string,
  data: Scoped<Prisma.WarehouseUncheckedCreateInput> = {},
) {
  const n = next();
  return prisma.warehouse.create({
    data: { organizationId, name: `Warehouse ${n}`, code: `WH-${n}`, ...data },
  });
}

export function createCustomer(
  organizationId: string,
  data: Scoped<Prisma.CustomerUncheckedCreateInput> = {},
) {
  return prisma.customer.create({ data: { organizationId, name: `Customer ${next()}`, ...data } });
}

export function createOrder(
  organizationId: string,
  warehouseId: string,
  data: Scoped<Omit<Prisma.OrderUncheckedCreateInput, 'warehouseId'>> = {},
) {
  return prisma.order.create({
    data: { organizationId, warehouseId, orderNumber: `SO-${next()}`, ...data },
  });
}

/** An organization with one warehouse and one product — the minimum for stock and order tests. */
export async function createStockFixture() {
  const organization = await createOrganization();
  const warehouse = await createWarehouse(organization.id);
  const product = await createProduct(organization.id);
  return { organization, warehouse, product };
}
