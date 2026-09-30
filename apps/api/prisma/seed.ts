/**
 * Development seed — `npm run db:seed`.
 *
 * Creates one fictional demo organization with a small, realistic dataset.
 * - Deterministic: fixed names, SKUs, codes, quantities, prices, and timestamps.
 * - Idempotent: skips if the demo organization already exists (but still gives
 *   demo users without a password the development password, and adds missing
 *   demo team members, catalog additions, and warehouse/inventory additions — see
 *   below). Every run ends by verifying that stock matches the movement history.
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

/**
 * Demo users added after the original seed (Phase 4): an ADMIN, so every role
 * can be tried, and a user without any organization for onboarding and
 * invitation acceptance. Ensured on every run, also on already-seeded databases.
 */
const DEMO_TEAM_ADDITIONS: { name: string; email: string; role: MemberRole | null }[] = [
  { name: 'Jordan Park', email: 'admin@demo-trading.example', role: MemberRole.ADMIN },
  { name: 'Casey Brooks', email: 'newcomer@demo-trading.example', role: null },
];

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
 * resulting on-hand quantities to `inventory` — the same invariant the inventory
 * service maintains (before + delta = after; inventory = last after = sum of deltas).
 */
class StockLedger {
  private recorded = 0;
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

    this.recorded += 1;
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
    actorUserId?: string;
    reason: string;
    /** Reference both legs to the transfer itself, as the inventory service does (Phase 6). */
    referenceTransfer?: boolean;
  }): Promise<string> {
    const transferGroupId = randomUUID();
    const shared = {
      productId: input.productId,
      createdAt: input.createdAt,
      actorUserId: input.actorUserId,
      reason: input.reason,
      transferGroupId,
      ...(input.referenceTransfer
        ? { referenceType: 'TRANSFER', referenceId: transferGroupId }
        : {}),
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

  /** Current quantity of one (warehouse, product) pair in this ledger. */
  quantity(warehouseId: string, productId: string): number {
    return this.levels.get(`${warehouseId}:${productId}`)?.quantity ?? 0;
  }

  get movementCount(): number {
    return this.recorded;
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

/** Idempotent upgrades for databases seeded by earlier versions of this script. */
async function ensureDemoTeam(tx: Tx, passwordHash: string): Promise<string[]> {
  const changes: string[] = [];
  const organization = await tx.organization.findUniqueOrThrow({
    where: { slug: SEED_ORGANIZATION_SLUG },
    select: { id: true },
  });

  // Databases seeded before authentication existed have password-less demo users.
  const { count } = await tx.user.updateMany({
    where: { email: { in: DEMO_USER_EMAILS }, passwordHash: null },
    data: { passwordHash },
  });
  if (count > 0) changes.push(`set the development password for ${count} demo user(s)`);

  for (const demo of DEMO_TEAM_ADDITIONS) {
    let user = await tx.user.findUnique({ where: { email: demo.email }, select: { id: true } });
    if (!user) {
      user = await tx.user.create({
        data: { name: demo.name, email: demo.email, passwordHash, createdAt: at(2) },
        select: { id: true },
      });
      changes.push(`created ${demo.email}`);
    }
    if (demo.role) {
      const membership = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
        select: { id: true },
      });
      if (!membership) {
        await tx.organizationMember.create({
          data: {
            organizationId: organization.id,
            userId: user.id,
            role: demo.role,
            createdAt: at(2),
          },
        });
        changes.push(`added ${demo.email} as ${demo.role}`);
      }
    }
  }
  return changes;
}

/**
 * Catalog additions (Phase 5): an "Accessories" category, four accessories,
 * and one archived product, so search, filters, sorting, pagination, and the
 * archived state have something to show. Matched by category name and SKU,
 * so re-running never duplicates them and never changes existing rows. Their
 * stock is added by ensureInventoryAdditions (Phase 6).
 */
const CATALOG_ADDITIONS = {
  category: { name: 'Accessories', description: 'Desk and computer accessories.' },
  products: [
    { sku: 'ACC-MOUSE-WL', name: 'Wireless Mouse', price: 2499, cost: 1140, minimumStock: 10 },
    { sku: 'ACC-KB-US', name: 'Keyboard, US Layout', price: 4900, cost: 2350, minimumStock: 8 },
    { sku: 'ACC-MON-24', name: 'Monitor, 24 inch', price: 18900, cost: 12400, minimumStock: 3 },
    {
      sku: 'ACC-STAND-AL',
      name: 'Laptop Stand, Aluminium',
      price: 3450,
      cost: 1500,
      minimumStock: 5,
    },
    {
      sku: 'ACC-MOUSE-WD',
      name: 'Wired Mouse (Discontinued)',
      price: 999,
      cost: 480,
      minimumStock: 0,
      archived: true,
    },
  ],
} as const;

async function ensureCatalogAdditions(tx: Tx): Promise<string[]> {
  const changes: string[] = [];
  const organization = await tx.organization.findUniqueOrThrow({
    where: { slug: SEED_ORGANIZATION_SLUG },
    select: { id: true },
  });
  const organizationId = organization.id;
  const owner = await tx.user.findUnique({
    where: { email: 'owner@demo-trading.example' },
    select: { id: true },
  });

  let category = await tx.category.findFirst({
    where: {
      organizationId,
      name: { equals: CATALOG_ADDITIONS.category.name, mode: 'insensitive' },
    },
    select: { id: true },
  });
  if (!category) {
    category = await tx.category.create({
      data: { organizationId, ...CATALOG_ADDITIONS.category, createdAt: at(10) },
      select: { id: true },
    });
    await tx.activityLog.create({
      data: {
        organizationId,
        actorUserId: owner?.id ?? null,
        action: 'CATEGORY_CREATED',
        entityType: 'Category',
        entityId: category.id,
        metadata: { name: CATALOG_ADDITIONS.category.name },
        createdAt: at(10),
      },
    });
    changes.push(`created category ${CATALOG_ADDITIONS.category.name}`);
  }

  for (const [index, item] of CATALOG_ADDITIONS.products.entries()) {
    const existing = await tx.product.findUnique({
      where: { organizationId_sku: { organizationId, sku: item.sku } },
      select: { id: true },
    });
    if (existing) continue;
    const archived = 'archived' in item && item.archived;
    const product = await tx.product.create({
      data: {
        organizationId,
        categoryId: category.id,
        sku: item.sku,
        name: item.name,
        price: money(item.price),
        cost: money(item.cost),
        minimumStock: item.minimumStock,
        status: archived ? 'ARCHIVED' : 'ACTIVE',
        createdAt: at(10, index + 1),
      },
      select: { id: true },
    });
    await tx.activityLog.createMany({
      data: [
        {
          organizationId,
          actorUserId: owner?.id ?? null,
          action: 'PRODUCT_CREATED',
          entityType: 'Product',
          entityId: product.id,
          metadata: { name: item.name, sku: item.sku },
          createdAt: at(10, index + 1),
        },
        ...(archived
          ? [
              {
                organizationId,
                actorUserId: owner?.id ?? null,
                action: 'PRODUCT_ARCHIVED',
                entityType: 'Product',
                entityId: product.id,
                metadata: { name: item.name, sku: item.sku },
                createdAt: at(11),
              },
            ]
          : []),
      ],
    });
    changes.push(`created product ${item.sku}`);
  }
  return changes;
}

/**
 * Warehouse & inventory additions (Phase 6): a third active warehouse, a
 * closed (archived) depot whose history is kept, and stock for the Phase 5
 * accessories built from purchases, sales, damage, an adjustment, and
 * transfers. Every quantity comes from the movement ledger, so inventory
 * matches history exactly. Resulting stock:
 *   Wireless Mouse (min 10):  MAIN 7 (low), NORTH 10 (low, at the reorder level), EAST 0 (out)
 *   Keyboard (min 8):         MAIN 26 (in stock), OLD 0 (archived depot)
 *   Monitor (min 3):          EAST 0 (out; one written off as damaged)
 *   Laptop Stand (min 5):     NORTH 15 (in stock, after a count adjustment)
 * Applied once (keyed by the NORTH warehouse code), and only while none of the
 * affected stock exists yet, so it never rewrites stock someone has changed.
 */
const INVENTORY_ADDITIONS = {
  north: {
    code: 'NORTH',
    name: 'North Overflow Storage',
    address: '8 Placeholder Lane, Lakeside',
  },
  old: { code: 'OLD', name: 'Harbor Street Depot (closed)', address: '3 Sample Quay, Springfield' },
  skus: {
    mouse: 'ACC-MOUSE-WL',
    keyboard: 'ACC-KB-US',
    monitor: 'ACC-MON-24',
    stand: 'ACC-STAND-AL',
  },
} as const;

async function ensureInventoryAdditions(tx: Tx): Promise<string[]> {
  const organization = await tx.organization.findUniqueOrThrow({
    where: { slug: SEED_ORGANIZATION_SLUG },
    select: { id: true },
  });
  const organizationId = organization.id;
  const { north: northData, old: oldData, skus } = INVENTORY_ADDITIONS;

  const existing = await tx.warehouse.findUnique({
    where: { organizationId_code: { organizationId, code: northData.code } },
    select: { id: true },
  });
  if (existing) return [];

  const warehouses = await tx.warehouse.findMany({
    where: { organizationId, code: { in: ['MAIN', 'EAST', oldData.code] } },
    select: { id: true, code: true },
  });
  const products = await tx.product.findMany({
    where: { organizationId, sku: { in: Object.values(skus) }, status: 'ACTIVE' },
    select: { id: true, sku: true },
  });
  const main = warehouses.find((warehouse) => warehouse.code === 'MAIN');
  const east = warehouses.find((warehouse) => warehouse.code === 'EAST');
  const productId = (sku: string) => products.find((product) => product.sku === sku)?.id;
  const [mouse, keyboard, monitor, stand] = [
    productId(skus.mouse),
    productId(skus.keyboard),
    productId(skus.monitor),
    productId(skus.stand),
  ];
  const touched = await tx.inventory.count({
    where: { organizationId, productId: { in: products.map((product) => product.id) } },
  });
  if (!main || !east || !mouse || !keyboard || !monitor || !stand || touched > 0) {
    return ['skipped demo stock: the demo warehouses or accessories were changed by hand'];
  }
  if (warehouses.some((warehouse) => warehouse.code === oldData.code)) {
    return ['skipped demo stock: a warehouse with code OLD already exists'];
  }

  const users = await tx.user.findMany({
    where: {
      email: {
        in: [
          'owner@demo-trading.example',
          'admin@demo-trading.example',
          'staff@demo-trading.example',
        ],
      },
    },
    select: { id: true, email: true },
  });
  const userId = (email: string) => users.find((user) => user.email === email)?.id ?? null;
  const owner = userId('owner@demo-trading.example');
  const admin = userId('admin@demo-trading.example') ?? owner;
  const staff = userId('staff@demo-trading.example') ?? owner;

  const north = await tx.warehouse.create({
    data: { organizationId, ...northData, createdAt: at(12) },
    select: { id: true, code: true, name: true },
  });
  const old = await tx.warehouse.create({
    data: { organizationId, ...oldData, createdAt: at(12) },
    select: { id: true, code: true, name: true },
  });
  const codeOf = new Map([
    [main.id, 'MAIN'],
    [east.id, 'EAST'],
    [north.id, north.code],
    [old.id, old.code],
  ]);
  const skuOf = new Map(products.map((product) => [product.id, product.sku]));

  const ledger = new StockLedger(tx, organizationId);
  const activity: Omit<Prisma.ActivityLogCreateManyInput, 'organizationId'>[] = [
    ...[north, old].map((warehouse) => ({
      action: 'WAREHOUSE_CREATED',
      entityType: 'Warehouse',
      entityId: warehouse.id,
      actorUserId: admin,
      metadata: { name: warehouse.name, code: warehouse.code },
      createdAt: at(12),
    })),
  ];

  /** One receive/issue/damage/adjustment, with its activity entry (same shape as the service). */
  const change = async (input: {
    type: 'PURCHASE' | 'SALE' | 'DAMAGE' | 'ADJUSTMENT';
    warehouseId: string;
    productId: string;
    delta: number;
    day: number;
    hour: number;
    actorUserId: string | null;
    reason?: string;
  }) => {
    const createdAt = at(input.day, input.hour);
    const before = ledger.quantity(input.warehouseId, input.productId);
    await ledger.record({
      warehouseId: input.warehouseId,
      productId: input.productId,
      type: StockMovementType[input.type],
      delta: input.delta,
      createdAt,
      actorUserId: input.actorUserId ?? undefined,
      reason: input.reason,
    });
    const actions = {
      PURCHASE: 'STOCK_RECEIVED',
      SALE: 'STOCK_ISSUED',
      DAMAGE: 'STOCK_DAMAGED',
      ADJUSTMENT: 'STOCK_ADJUSTED',
    } as const;
    activity.push({
      action: actions[input.type],
      entityType: 'Product',
      entityId: input.productId,
      actorUserId: input.actorUserId,
      metadata: {
        warehouseId: input.warehouseId,
        warehouseCode: codeOf.get(input.warehouseId) ?? null,
        productId: input.productId,
        sku: skuOf.get(input.productId) ?? null,
        ...(input.type === 'ADJUSTMENT' ? {} : { quantity: Math.abs(input.delta) }),
        quantityBefore: before,
        quantityAfter: before + input.delta,
        quantityDelta: input.delta,
      },
      createdAt,
    });
  };

  const transfer = async (input: {
    from: string;
    to: string;
    productId: string;
    quantity: number;
    day: number;
    hour: number;
    actorUserId: string | null;
    reason: string;
  }) => {
    const createdAt = at(input.day, input.hour);
    const sourceBefore = ledger.quantity(input.from, input.productId);
    const destinationBefore = ledger.quantity(input.to, input.productId);
    const transferGroupId = await ledger.transfer({
      fromWarehouseId: input.from,
      toWarehouseId: input.to,
      productId: input.productId,
      quantity: input.quantity,
      createdAt,
      actorUserId: input.actorUserId ?? undefined,
      reason: input.reason,
      referenceTransfer: true,
    });
    activity.push({
      action: 'STOCK_TRANSFERRED',
      entityType: 'Product',
      entityId: input.productId,
      actorUserId: input.actorUserId,
      metadata: {
        productId: input.productId,
        sku: skuOf.get(input.productId) ?? null,
        sourceWarehouseId: input.from,
        sourceWarehouseCode: codeOf.get(input.from) ?? null,
        destinationWarehouseId: input.to,
        destinationWarehouseCode: codeOf.get(input.to) ?? null,
        quantity: input.quantity,
        transferGroupId,
        source: { quantityBefore: sourceBefore, quantityAfter: sourceBefore - input.quantity },
        destination: {
          quantityBefore: destinationBefore,
          quantityAfter: destinationBefore + input.quantity,
        },
      },
      createdAt,
    });
  };

  // prettier-ignore
  type Step =
    | { kind: 'PURCHASE' | 'SALE' | 'DAMAGE' | 'ADJUSTMENT'; at: [number, number]; warehouse: string; product: string; delta: number; by: string | null; reason?: string }
    | { kind: 'TRANSFER'; at: [number, number]; from: string; to: string; product: string; quantity: number; by: string | null; reason: string }
    | { kind: 'ARCHIVE'; at: [number, number]; warehouse: string; by: string | null };
  // prettier-ignore
  const steps: Step[] = [
    // Keyboard: stocked at the old depot, moved to MAIN, then the depot closed.
    { kind: 'PURCHASE', at: [12, 1], warehouse: old.id, product: keyboard, delta: 10, by: staff, reason: 'Supplier delivery DN-2041' },
    { kind: 'TRANSFER', at: [13, 1], from: old.id, to: main.id, product: keyboard, quantity: 10, by: admin, reason: 'Depot closing: move remaining stock' },
    { kind: 'ARCHIVE', at: [13, 3], warehouse: old.id, by: admin },
    { kind: 'PURCHASE', at: [14, 1], warehouse: main.id, product: keyboard, delta: 20, by: staff, reason: 'Supplier delivery DN-2057' },
    { kind: 'SALE', at: [17, 2], warehouse: main.id, product: keyboard, delta: -4, by: staff, reason: 'Counter sale' },
    // Wireless Mouse: low in MAIN and NORTH, sold out in EAST.
    { kind: 'PURCHASE', at: [12, 2], warehouse: main.id, product: mouse, delta: 40, by: staff, reason: 'Supplier delivery DN-2042' },
    { kind: 'PURCHASE', at: [12, 3], warehouse: east.id, product: mouse, delta: 5, by: staff, reason: 'Supplier delivery DN-2043' },
    { kind: 'SALE', at: [15, 2], warehouse: main.id, product: mouse, delta: -25, by: staff, reason: 'Bulk sale to a walk-in customer' },
    { kind: 'TRANSFER', at: [16, 1], from: main.id, to: north.id, product: mouse, quantity: 8, by: admin, reason: 'Overflow storage' },
    { kind: 'PURCHASE', at: [16, 4], warehouse: north.id, product: mouse, delta: 2, by: staff },
    { kind: 'SALE', at: [18, 1], warehouse: east.id, product: mouse, delta: -5, by: staff },
    // Monitor: one damaged on arrival, the rest sold.
    { kind: 'PURCHASE', at: [12, 4], warehouse: east.id, product: monitor, delta: 6, by: staff, reason: 'Supplier delivery DN-2044' },
    { kind: 'DAMAGE', at: [13, 2], warehouse: east.id, product: monitor, delta: -1, by: staff, reason: 'Cracked screen on arrival' },
    { kind: 'SALE', at: [18, 3], warehouse: east.id, product: monitor, delta: -5, by: staff },
    // Laptop Stand: a cycle count found more than the system showed.
    { kind: 'PURCHASE', at: [14, 2], warehouse: north.id, product: stand, delta: 12, by: staff, reason: 'Supplier delivery DN-2058' },
    { kind: 'ADJUSTMENT', at: [19, 1], warehouse: north.id, product: stand, delta: 3, by: owner, reason: 'Cycle count: 3 units found on the returns shelf' },
  ];
  // Applied in time order, so each (warehouse, product) history chains correctly.
  steps.sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1]);
  for (const step of steps) {
    const [day, hour] = step.at;
    if (step.kind === 'TRANSFER') {
      await transfer({
        from: step.from,
        to: step.to,
        productId: step.product,
        quantity: step.quantity,
        day,
        hour,
        actorUserId: step.by,
        reason: step.reason,
      });
    } else if (step.kind === 'ARCHIVE') {
      activity.push({
        action: 'WAREHOUSE_ARCHIVED',
        entityType: 'Warehouse',
        entityId: step.warehouse,
        actorUserId: step.by,
        metadata: { name: old.name, code: old.code },
        createdAt: at(day, hour),
      });
    } else {
      await change({
        type: step.kind,
        warehouseId: step.warehouse,
        productId: step.product,
        delta: step.delta,
        day,
        hour,
        actorUserId: step.by,
        reason: step.reason,
      });
    }
  }

  // The depot closes only after its stock has moved out.
  await tx.warehouse.update({ where: { id: old.id }, data: { isActive: false } });
  const inventoryRows = await ledger.writeInventory();
  await tx.activityLog.createMany({
    data: activity.map((entry) => ({ ...entry, organizationId })),
  });
  return [
    `created warehouses NORTH and OLD (archived) with ${inventoryRows} stock records and ${ledger.movementCount} movements`,
  ];
}

/**
 * Checks the core inventory invariant for the demo organization: every stock
 * record equals the last `quantityAfter` and the sum of its movements.
 */
async function verifyStockLedger(prisma: PrismaClient): Promise<number> {
  const mismatches = await prisma.$queryRaw<{ id: string }[]>`
    SELECT i.id
    FROM inventory i
    JOIN organizations o ON o.id = i.organization_id AND o.slug = ${SEED_ORGANIZATION_SLUG}
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(m.quantity_delta), 0)::int AS total,
             (SELECT last.quantity_after FROM stock_movements last
              WHERE last.warehouse_id = i.warehouse_id AND last.product_id = i.product_id
              ORDER BY last.created_at DESC, last.id DESC LIMIT 1) AS last_after
      FROM stock_movements m
      WHERE m.warehouse_id = i.warehouse_id AND m.product_id = i.product_id
    ) ledger ON true
    WHERE i.quantity <> ledger.total OR i.quantity <> COALESCE(ledger.last_after, 0)`;
  if (mismatches.length > 0) {
    throw new Error(
      `Stock ledger mismatch for inventory ${mismatches.map((row) => row.id).join(', ')}.`,
    );
  }
  const [{ count }] = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM inventory i
    JOIN organizations o ON o.id = i.organization_id AND o.slug = ${SEED_ORGANIZATION_SLUG}`;
  return count;
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
      console.log(
        `Seed skipped: organization "${SEED_ORGANIZATION_SLUG}" already exists in "${database.name}".`,
      );
    } else {
      const summary = await prisma.$transaction((tx) => seed(tx, passwordHash), {
        timeout: 60_000,
      });
      const movements = await prisma.stockMovement.count({
        where: { organization: { slug: SEED_ORGANIZATION_SLUG } },
      });
      console.log(`Seeded "${database.name}":`, { ...summary, stockMovements: movements });
    }

    const changes = await prisma.$transaction((tx) => ensureDemoTeam(tx, passwordHash));
    console.log(
      changes.length > 0 ? `Demo team updated: ${changes.join('; ')}.` : 'Demo team is up to date.',
    );

    const catalogChanges = await prisma.$transaction((tx) => ensureCatalogAdditions(tx));
    console.log(
      catalogChanges.length > 0
        ? `Demo catalog updated: ${catalogChanges.join('; ')}.`
        : 'Demo catalog is up to date.',
    );

    const inventoryChanges = await prisma.$transaction((tx) => ensureInventoryAdditions(tx), {
      timeout: 60_000,
    });
    console.log(
      inventoryChanges.length > 0
        ? `Demo inventory updated: ${inventoryChanges.join('; ')}.`
        : 'Demo inventory is up to date.',
    );

    const verified = await verifyStockLedger(prisma);
    console.log(`Stock ledger verified: ${verified} stock records match their movement history.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
