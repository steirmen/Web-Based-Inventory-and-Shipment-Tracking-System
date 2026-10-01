import {
  INVENTORY_LIMITS,
  type InventoryListResponse,
  type InventoryResponse,
  type InventorySortField,
  type SortOrder,
  type StockMovementListResponse,
} from '@app/shared';
import { Injectable } from '@nestjs/common';
import { instantRange } from '../common/time/local-days.js';
import { escapeLikePattern } from '../common/validation/like-pattern.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type {
  InventoryListQueryDto,
  PageQueryDto,
  StockMovementListQueryDto,
} from './dto/inventory.dto.js';
import {
  inventoryNotFound,
  inventoryProductNotFound,
  inventoryWarehouseNotFound,
  stockMovementActorNotFound,
} from './inventory-errors.js';
import {
  INVENTORY_SELECT,
  STOCK_MOVEMENT_SELECT,
  STOCK_STATUS_SQL,
  toInventoryItem,
  toStockMovement,
} from './inventory-mappers.js';

/** Whitelisted sort expressions — a client string is never used as a column name. */
const SORT_COLUMNS: Record<InventorySortField, Prisma.Sql> = {
  productName: Prisma.sql`p.name`,
  sku: Prisma.sql`p.sku`,
  quantity: Prisma.sql`i.quantity`,
  updatedAt: Prisma.sql`i.updated_at`,
};

function paging(query: PageQueryDto) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? INVENTORY_LIMITS.pageSizeDefault;
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function pagination(page: number, pageSize: number, totalItems: number) {
  return { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) };
}

/**
 * Read side of inventory: current stock (Inventory rows) and the immutable
 * history (StockMovement rows). Every query is scoped to the organization, and
 * ids in filters are verified to belong to it.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, query: InventoryListQueryDto): Promise<InventoryListResponse> {
    const { page, pageSize, skip } = paging(query);
    await this.assertFilterIds(organizationId, query);

    const conditions: Prisma.Sql[] = [Prisma.sql`i.organization_id = ${organizationId}::uuid`];
    if (query.warehouseId) conditions.push(Prisma.sql`i.warehouse_id = ${query.warehouseId}::uuid`);
    if (query.productId) conditions.push(Prisma.sql`i.product_id = ${query.productId}::uuid`);
    if (query.search) {
      const pattern = `%${escapeLikePattern(query.search)}%`;
      conditions.push(Prisma.sql`(p.name ILIKE ${pattern} OR p.sku ILIKE ${pattern})`);
    }
    if (query.status) conditions.push(STOCK_STATUS_SQL[query.status]);

    // Composite joins keep the rows inside the organization even at the SQL level.
    const from = Prisma.sql`
      FROM inventory i
      JOIN products p ON p.organization_id = i.organization_id AND p.id = i.product_id
      JOIN warehouses w ON w.organization_id = i.organization_id AND w.id = i.warehouse_id
      WHERE ${Prisma.join(conditions, ' AND ')}`;
    const direction = Prisma.raw((query.sortOrder ?? 'asc') === 'desc' ? 'DESC' : 'ASC');
    const sortColumn = SORT_COLUMNS[query.sortBy ?? 'productName'];

    const [counted, page_] = await this.prisma.$transaction([
      this.prisma.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count ${from}`,
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT i.id ${from}
        ORDER BY ${sortColumn} ${direction}, w.code ASC, i.id ASC
        LIMIT ${pageSize} OFFSET ${skip}`,
    ]);
    const ids = page_.map((row) => row.id);
    const rows = ids.length
      ? await this.prisma.inventory.findMany({
          where: { organizationId, id: { in: ids } },
          select: INVENTORY_SELECT,
        })
      : [];
    const byId = new Map(rows.map((row) => [row.id, row]));

    return {
      items: ids.flatMap((id) => {
        const row = byId.get(id);
        return row ? [toInventoryItem(row)] : [];
      }),
      pagination: pagination(page, pageSize, counted[0]?.count ?? 0),
    };
  }

  async get(organizationId: string, inventoryId: string): Promise<InventoryResponse> {
    const row = await this.prisma.inventory.findFirst({
      where: { id: inventoryId, organizationId },
      select: INVENTORY_SELECT,
    });
    if (!row) throw inventoryNotFound();
    return { inventory: toInventoryItem(row) };
  }

  /** History of one inventory row (its warehouse + product), newest first. */
  async movements(
    organizationId: string,
    inventoryId: string,
    query: PageQueryDto,
  ): Promise<StockMovementListResponse> {
    const inventory = await this.prisma.inventory.findFirst({
      where: { id: inventoryId, organizationId },
      select: { warehouseId: true, productId: true },
    });
    if (!inventory) throw inventoryNotFound();

    const { page, pageSize, skip } = paging(query);
    const where: Prisma.StockMovementWhereInput = { organizationId, ...inventory };
    const [totalItems, rows] = await this.prisma.$transaction([
      this.prisma.stockMovement.count({ where }),
      this.prisma.stockMovement.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        select: STOCK_MOVEMENT_SELECT,
      }),
    ]);
    return { items: rows.map(toStockMovement), pagination: pagination(page, pageSize, totalItems) };
  }

  /** Organization-wide movement ledger with filters. */
  async listMovements(
    organizationId: string,
    query: StockMovementListQueryDto,
  ): Promise<StockMovementListResponse> {
    const { page, pageSize, skip } = paging(query);
    await this.assertFilterIds(organizationId, query);
    if (query.actorUserId) await this.assertActor(organizationId, query.actorUserId);

    // Dates are local days in `timeZone` (default UTC), as on the dashboard and in the reports.
    const createdAt = instantRange(query.from, query.to, query.timeZone);
    const hasRange = Boolean(query.from || query.to);

    const search = query.search ? escapeLikePattern(query.search) : undefined;
    const where: Prisma.StockMovementWhereInput = {
      organizationId,
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.movementType ? { movementType: query.movementType } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.transferGroupId ? { transferGroupId: query.transferGroupId } : {}),
      ...(hasRange ? { createdAt } : {}),
      ...(search
        ? {
            OR: [
              { product: { name: { contains: search, mode: 'insensitive' } } },
              { product: { sku: { contains: search, mode: 'insensitive' } } },
              { reason: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const order: SortOrder = query.sortOrder ?? 'desc';

    const [totalItems, rows] = await this.prisma.$transaction([
      this.prisma.stockMovement.count({ where }),
      this.prisma.stockMovement.findMany({
        where,
        orderBy: [{ createdAt: order }, { id: order }],
        skip,
        take: pageSize,
        select: STOCK_MOVEMENT_SELECT,
      }),
    ]);
    return { items: rows.map(toStockMovement), pagination: pagination(page, pageSize, totalItems) };
  }

  /** Filter ids must belong to this organization (422, never another tenant's data). */
  private async assertFilterIds(
    organizationId: string,
    filters: { warehouseId?: string; productId?: string },
  ): Promise<void> {
    const [warehouse, product] = await Promise.all([
      filters.warehouseId
        ? this.prisma.warehouse.findFirst({
            where: { id: filters.warehouseId, organizationId },
            select: { id: true },
          })
        : true,
      filters.productId
        ? this.prisma.product.findFirst({
            where: { id: filters.productId, organizationId },
            select: { id: true },
          })
        : true,
    ]);
    if (!warehouse) throw inventoryWarehouseNotFound();
    if (!product) throw inventoryProductNotFound();
  }

  /** A current member, or someone who recorded movements here before leaving. */
  private async assertActor(organizationId: string, userId: string): Promise<void> {
    const [member, movement] = await Promise.all([
      this.prisma.organizationMember.findFirst({
        where: { organizationId, userId },
        select: { id: true },
      }),
      this.prisma.stockMovement.findFirst({
        where: { organizationId, actorUserId: userId },
        select: { id: true },
      }),
    ]);
    if (!member && !movement) throw stockMovementActorNotFound();
  }
}
