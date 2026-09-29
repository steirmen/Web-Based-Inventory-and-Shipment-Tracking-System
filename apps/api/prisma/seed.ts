/**
 * Development seed — `npm run db:seed`.
 *
 * Creates one fictional demo organization with a small, realistic dataset.
 * - Deterministic: fixed names, SKUs, codes, quantities, prices, and timestamps.
 * - Idempotent: skips if the demo organization already exists (but still gives
 *   demo users without a password the development password — see below).
 * - Atomic: runs in a single transaction.
 * - Development only: refuses to run with NODE_ENV=production. All people,
 *   emails (reserved `.example` domain), and phone numbers (555-01xx) are fictional.
 *
 * Demo users sign in with DEMO_PASSWORD. It is a DEVELOPMENT-ONLY credential:
 * only its Argon2id hash is stored, and it must never be used outside local development.
 */
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { buildDatabaseUrl, databaseOptionsFromEnv } from '../src/config/database-url.js';
import { hashPassword } from '../src/auth/password/password-hashing.js';
import { ROOT_ENV_FILE } from '../src/config/env.js';
import {
  MemberRole,
  OrderStatus,
  type Prisma,
  PrismaClient,
  StockMovementType,
} from '../src/generated/prisma/client.js';

const SEED_ORGANIZATION_SLUG = 'demo-trading';

/** DEVELOPMENT-ONLY password shared by the demo users (documented in README). */
const DEMO_PASSWORD = 'demo-password-2026';
const DEMO_USER_EMAILS = ['owner@demo-trading.example', 'staff@demo-trading.example'];

/** All seeded timestamps are offsets from this fixed instant. */
const BASE_TIME = Date.parse('2026-09-01T08:00:00.000Z');
const HOUR = 3_600_000;
const at = (day: number, hour = 0): Date => new Date(BASE_TIME + (day * 24 + hour) * HOUR);

/** Money is handled in integer cents and passed to Prisma as exact decimal strings. */
const money = (cents: number): string => (cents / 100).toFixed(2);

type Tx = Prisma.TransactionClient;

interface MovementInput {
  warehouseId: string;
  productId: string;
  type: StockMovementType;
  delta: number;
  createdAt: Date;
  actorUserId?: string;
  reason?: string;
  referenceType?: string;
  referenceId?: string;
  transferGroupId?: string;
}

/**
 * Records stock movements with consistent before/after quantities and writes the
 * resulting on-hand quantities to `inventory` — the same invariant the future
 * inventory service must maintain.
 */
class StockLedger {
  private readonly levels = new Map<
    string,
    { warehouseId: string; productId: string; quantity: number }
  >();

  constructor(
    private readonly tx: Tx,
    private readonly organizationId: string,
  ) {}

  async record(input: MovementInput): Promise<void> {
    const key = `${input.warehouseId}:${input.productId}`;
    const level = this.levels.get(key) ?? {
      warehouseId: input.warehouseId,
      productId: input.productId,
      quantity: 0,
    };
    const quantityBefore = level.quantity;
    level.quantity += input.delta;
    this.levels.set(key, level);

    await this.tx.stockMovement.create({
      data: {
        organizationId: this.organizationId,
        warehouseId: input.warehouseId,
        productId: input.productId,
        actorUserId: input.actorUserId,
        movementType: input.type,
        quantityDelta: input.delta,
        quantityBefore,
        quantityAfter: level.quantity,
        reason: input.reason,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        transferGroupId: input.transferGroupId,
        createdAt: input.createdAt,
      },
    });
  }

  async transfer(input: {
    fromWarehouseId: string;
    toWarehouseId: string;
    productId: string;
    quantity: number;
    createdAt: Date;
    actorUserId: string;
    reason: string;
  }): Promise<string> {
    const transferGroupId = randomUUID();
    const shared = {
      productId: input.productId,
      createdAt: input.createdAt,
      actorUserId: input.actorUserId,
      reason: input.reason,
      transferGroupId,
    };
    await this.record({
      ...shared,
      warehouseId: input.fromWarehouseId,
      type: StockMovementType.TRANSFER_OUT,
      delta: -input.quantity,
    });
    await this.record({
      ...shared,
      warehouseId: input.toWarehouseId,
      type: StockMovementType.TRANSFER_IN,
      delta: input.quantity,
    });
    return transferGroupId;
  }

  async writeInventory(): Promise<number> {
    await this.tx.inventory.createMany({
      data: [...this.levels.values()].map((level) => ({
        organizationId: this.organizationId,
        ...level,
      })),
    });
    return this.levels.size;
  }
}

async function seed(tx: Tx, passwordHash: string): Promise<Record<string, number>> {
  // --- Identity & tenancy ------------------------------------------------------
  const owner = await tx.user.create({
    data: {
      name: 'Morgan Lane',
      email: 'owner@demo-trading.example',
      passwordHash,
      createdAt: at(0),
    },
  });
  const staff = await tx.user.create({
    data: {
      name: 'Riley Chen',
      email: 'staff@demo-trading.example',
      passwordHash,
      createdAt: at(0, 1),
    },
  });

  const organization = await tx.organization.create({
    data: { name: 'Demo Trading Co.', slug: SEED_ORGANIZATION_SLUG, createdAt: at(0) },
  });
  const organizationId = organization.id;

  await tx.organizationMember.createMany({
    data: [
      { organizationId, userId: owner.id, role: MemberRole.OWNER, createdAt: at(0) },
      { organizationId, userId: staff.id, role: MemberRole.STAFF, createdAt: at(0, 1) },
    ],
  });

  // --- Catalog -------------------------------------------------------------------
  const categoryData = [
    { key: 'office', name: 'Office Supplies', description: 'Everyday office consumables.' },
    { key: 'packaging', name: 'Packaging', description: 'Boxes, tape, and shipping materials.' },
    { key: 'electronics', name: 'Electronics', description: 'Cables and small accessories.' },
  ] as const;
  const categories: Record<string, string> = {};
  for (const { key, ...data } of categoryData) {
    const category = await tx.category.create({
      data: { organizationId, ...data, createdAt: at(1) },
    });
    categories[key] = category.id;
  }

  const productData = [
    {
      key: 'pen',
      sku: 'OFF-PEN-BLK-12',
      name: 'Ballpoint Pen, Black (Box of 12)',
      category: 'office',
      price: 850,
      cost: 420,
      minimumStock: 20,
    },
    {
      key: 'paper',
      sku: 'OFF-PAP-A4-500',
      name: 'Copy Paper A4, 500 Sheets',
      category: 'office',
      price: 690,
      cost: 380,
      minimumStock: 50,
    },
    {
      key: 'box',
      sku: 'PKG-BOX-M',
      name: 'Shipping Box, Medium',
      category: 'packaging',
      price: 125,
      cost: 55,
      minimumStock: 100,
    },
    {
      key: 'tape',
      sku: 'PKG-TAPE-48',
      name: 'Packing Tape, 48 mm',
      category: 'packaging',
      price: 340,
      cost: 160,
      minimumStock: 40,
    },
    {
      key: 'cable',
      sku: 'ELE-USB-C-1M',
      name: 'USB-C Cable, 1 m',
      category: 'electronics',
      price: 1200,
      cost: 510,
      minimumStock: 15,
    },
  ] as const;
  const products: Record<string, { id: string; name: string; sku: string; priceCents: number }> =
    {};
  for (const { key, category, price, cost, ...data } of productData) {
    const product = await tx.product.create({
      data: {
        organizationId,
        categoryId: categories[category],
        ...data,
        price: money(price),
        cost: money(cost),
        createdAt: at(1, 1),
      },
    });
    products[key] = { id: product.id, name: product.name, sku: product.sku, priceCents: price };
  }

  // --- Warehouses & customers -----------------------------------------------------
  const main = await tx.warehouse.create({
    data: {
      organizationId,
      name: 'Main Warehouse',
      code: 'MAIN',
      address: '100 Example Street, Springfield',
      createdAt: at(1),
    },
  });
  const east = await tx.warehouse.create({
    data: {
      organizationId,
      name: 'East Distribution Center',
      code: 'EAST',
      address: '25 Sample Avenue, Riverton',
      createdAt: at(1),
    },
  });

  const clinic = await tx.customer.create({
    data: {
      organizationId,
      name: 'Jamie Rivera',
      companyName: 'Riverside Dental Clinic',
      email: 'purchasing@riverside-dental.example',
      phone: '+1 555 0101',
      address: '12 Harbor Road, Springfield',
      createdAt: at(2),
    },
  });
  const studio = await tx.customer.create({
    data: {
      organizationId,
      name: 'Sam Patel',
      companyName: 'Brightline Studio',
      email: 'studio@brightline.example',
      phone: '+1 555 0102',
      notes: 'Prefers deliveries before noon.',
      createdAt: at(2),
    },
  });

  // --- Stock history ------------------------------------------------------------------
  const ledger = new StockLedger(tx, organizationId);
  const purchase = (warehouseId: string, productKey: string, quantity: number, day: number) =>
    ledger.record({
      warehouseId,
      productId: products[productKey].id,
      type: StockMovementType.PURCHASE,
      delta: quantity,
      createdAt: at(day),
      actorUserId: owner.id,
      reason: 'Initial stock purchase',
      referenceType: 'PURCHASE_ORDER',
      referenceId: randomUUID(),
    });

  await purchase(main.id, 'pen', 200, 3);
  await purchase(main.id, 'paper', 400, 3);
  await purchase(main.id, 'box', 1000, 3);
  await purchase(main.id, 'tape', 150, 3);
  await purchase(main.id, 'cable', 80, 3);
  await purchase(east.id, 'box', 300, 4);
  await purchase(east.id, 'paper', 100, 4);

  await ledger.transfer({
    fromWarehouseId: main.id,
    toWarehouseId: east.id,
    productId: products.cable.id,
    quantity: 20,
    createdAt: at(5),
    actorUserId: staff.id,
    reason: 'Rebalance stock for east region',
  });
  await ledger.record({
    warehouseId: main.id,
    productId: products.paper.id,
    type: StockMovementType.DAMAGE,
    delta: -5,
    createdAt: at(6),
    actorUserId: staff.id,
    reason: 'Water damage during unloading',
  });
  await ledger.record({
    warehouseId: main.id,
    productId: products.tape.id,
    type: StockMovementType.ADJUSTMENT,
    delta: -2,
    createdAt: at(7),
    actorUserId: owner.id,
    reason: 'Cycle count correction',
  });

  // --- Orders -----------------------------------------------------------------------
  const createOrder = async (input: {
    orderNumber: string;
    customerId: string;
    warehouseId: string;
    status: OrderStatus;
    createdAt: Date;
    lines: { productKey: string; quantity: number }[];
  }) => {
    const items = input.lines.map(({ productKey, quantity }) => {
      const product = products[productKey];
      return {
        product,
        quantity,
        lineTotalCents: product.priceCents * quantity,
      };
    });
    const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);

    return tx.order.create({
      data: {
        organizationId,
        orderNumber: input.orderNumber,
        customerId: input.customerId,
        warehouseId: input.warehouseId,
        status: input.status,
        subtotal: money(subtotalCents),
        total: money(subtotalCents),
        createdAt: input.createdAt,
        items: {
          // organizationId and orderId are inherited from the parent order (composite key).
          create: items.map(({ product, quantity, lineTotalCents }) => ({
            productId: product.id,
            productNameSnapshot: product.name,
            skuSnapshot: product.sku,
            unitPrice: money(product.priceCents),
            quantity,
            lineTotal: money(lineTotalCents),
            createdAt: input.createdAt,
          })),
        },
      },
    });
  };

  const completedOrder = await createOrder({
    orderNumber: 'SO-1001',
    customerId: clinic.id,
    warehouseId: main.id,
    status: OrderStatus.COMPLETED,
    createdAt: at(8),
    lines: [
      { productKey: 'pen', quantity: 10 },
      { productKey: 'cable', quantity: 5 },
    ],
  });
  for (const [productKey, quantity] of [
    ['pen', 10],
    ['cable', 5],
  ] as const) {
    await ledger.record({
      warehouseId: main.id,
      productId: products[productKey].id,
      type: StockMovementType.SALE,
      delta: -quantity,
      createdAt: at(9),
      actorUserId: staff.id,
      referenceType: 'ORDER',
      referenceId: completedOrder.id,
    });
  }

  const confirmedOrder = await createOrder({
    orderNumber: 'SO-1002',
    customerId: studio.id,
    warehouseId: east.id,
    status: OrderStatus.CONFIRMED,
    createdAt: at(10),
    lines: [
      { productKey: 'box', quantity: 50 },
      { productKey: 'paper', quantity: 10 },
    ],
  });

  const inventoryRows = await ledger.writeInventory();

  // --- Activity log -------------------------------------------------------------------
  const activity: Omit<Prisma.ActivityLogCreateManyInput, 'organizationId'>[] = [
    {
      action: 'ORGANIZATION_CREATED',
      entityType: 'Organization',
      entityId: organizationId,
      actorUserId: owner.id,
      createdAt: at(0),
    },
    {
      action: 'MEMBER_ADDED',
      entityType: 'OrganizationMember',
      actorUserId: owner.id,
      metadata: { email: staff.email, role: MemberRole.STAFF },
      createdAt: at(0, 1),
    },
    ...Object.values(products).map((product) => ({
      action: 'PRODUCT_CREATED',
      entityType: 'Product',
      entityId: product.id,
      actorUserId: owner.id,
      metadata: { sku: product.sku },
      createdAt: at(1, 1),
    })),
    {
      action: 'STOCK_TRANSFERRED',
      entityType: 'Product',
      entityId: products.cable.id,
      actorUserId: staff.id,
      metadata: { from: 'MAIN', to: 'EAST', quantity: 20 },
      createdAt: at(5),
    },
    {
      action: 'STOCK_ADJUSTED',
      entityType: 'Product',
      entityId: products.tape.id,
      actorUserId: owner.id,
      metadata: { warehouse: 'MAIN', delta: -2, reason: 'Cycle count correction' },
      createdAt: at(7),
    },
    {
      action: 'ORDER_CREATED',
      entityType: 'Order',
      entityId: completedOrder.id,
      actorUserId: staff.id,
      metadata: { orderNumber: 'SO-1001' },
      createdAt: at(8),
    },
    {
      action: 'ORDER_COMPLETED',
      entityType: 'Order',
      entityId: completedOrder.id,
      actorUserId: staff.id,
      metadata: { orderNumber: 'SO-1001' },
      createdAt: at(9),
    },
    {
      action: 'ORDER_CREATED',
      entityType: 'Order',
      entityId: confirmedOrder.id,
      actorUserId: staff.id,
      metadata: { orderNumber: 'SO-1002' },
      createdAt: at(10),
    },
    {
      action: 'ORDER_CONFIRMED',
      entityType: 'Order',
      entityId: confirmedOrder.id,
      actorUserId: owner.id,
      metadata: { orderNumber: 'SO-1002' },
      createdAt: at(10, 2),
    },
  ];
  await tx.activityLog.createMany({
    data: activity.map((entry) => ({ ...entry, organizationId })),
  });

  return {
    organizations: 1,
    users: 2,
    members: 2,
    categories: categoryData.length,
    products: productData.length,
    warehouses: 2,
    customers: 2,
    orders: 2,
    inventory: inventoryRows,
    activityLogs: activity.length,
  };
}

async function main(): Promise<void> {
  loadEnv({ path: ROOT_ENV_FILE, quiet: true });

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the development seed with NODE_ENV=production.');
  }

  const database = databaseOptionsFromEnv(process.env);
  if (!database) {
    throw new Error('DB_HOST, DB_NAME, and DB_USER must be set. Copy .env.example to .env.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: buildDatabaseUrl(database) }),
  });

  try {
    const existing = await prisma.organization.findUnique({
      where: { slug: SEED_ORGANIZATION_SLUG },
    });
    const passwordHash = await hashPassword(DEMO_PASSWORD);

    if (existing) {
      // Databases seeded before authentication existed have password-less demo users.
      const { count } = await prisma.user.updateMany({
        where: { email: { in: DEMO_USER_EMAILS }, passwordHash: null },
        data: { passwordHash },
      });
      console.log(
        `Seed skipped: organization "${SEED_ORGANIZATION_SLUG}" already exists in "${database.name}".` +
          (count > 0 ? ` Set the development password for ${count} demo user(s).` : ''),
      );
      return;
    }

    const summary = await prisma.$transaction((tx) => seed(tx, passwordHash), {
      timeout: 60_000,
    });
    const movements = await prisma.stockMovement.count({
      where: { organization: { slug: SEED_ORGANIZATION_SLUG } },
    });
    console.log(`Seeded "${database.name}":`, { ...summary, stockMovements: movements });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
