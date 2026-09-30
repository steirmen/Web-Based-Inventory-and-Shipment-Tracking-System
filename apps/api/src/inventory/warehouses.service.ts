import type { WarehouseListResponse, WarehouseResponse } from '@app/shared';
import { Injectable } from '@nestjs/common';
import { ActivityAction, recordActivity } from '../activity/activity-log.js';
import { isUniqueViolation } from '../common/errors/prisma-errors.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { OrganizationContext } from '../organizations/organization-context.js';
import type { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto.js';
import {
  warehouseCodeImmutable,
  warehouseCodeTaken,
  warehouseNotFound,
  warehouseStatusInvalid,
} from './inventory-errors.js';
import {
  NO_STOCK,
  toWarehouse,
  WAREHOUSE_SELECT,
  type WarehouseTotals,
} from './inventory-mappers.js';

type Client = Prisma.TransactionClient | PrismaService;

/**
 * Organization-scoped warehouses. Warehouses are archived (isActive = false),
 * never deleted: inventory and stock history keep referencing them.
 */
@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  /** All warehouses, active first, then by name; stock totals in one grouped query (no N+1). */
  async list(organizationId: string): Promise<WarehouseListResponse> {
    const [warehouses, totals] = await Promise.all([
      this.prisma.warehouse.findMany({
        where: { organizationId },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }, { id: 'asc' }],
        select: WAREHOUSE_SELECT,
      }),
      this.totals(this.prisma, organizationId),
    ]);
    return {
      warehouses: warehouses.map((row) => toWarehouse(row, totals.get(row.id))),
    };
  }

  async get(organizationId: string, warehouseId: string): Promise<WarehouseResponse> {
    return this.read(this.prisma, organizationId, warehouseId);
  }

  async create(
    context: OrganizationContext,
    input: CreateWarehouseDto,
  ): Promise<WarehouseResponse> {
    const organizationId = context.organization.id;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const warehouse = await tx.warehouse.create({
          data: {
            organizationId,
            name: input.name,
            code: input.code,
            address: input.address ?? null,
          },
          select: WAREHOUSE_SELECT,
        });
        await recordActivity(tx, {
          organizationId,
          actorUserId: context.user.id,
          action: ActivityAction.WAREHOUSE_CREATED,
          entityType: 'Warehouse',
          entityId: warehouse.id,
          metadata: { name: warehouse.name, code: warehouse.code },
        });
        return { warehouse: toWarehouse(warehouse) };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw warehouseCodeTaken();
      throw error;
    }
  }

  /** Name and address only. Logs only real changes. */
  async update(
    context: OrganizationContext,
    warehouseId: string,
    input: UpdateWarehouseDto,
  ): Promise<WarehouseResponse> {
    if (input.code !== undefined) throw warehouseCodeImmutable();
    if (input.isActive !== undefined) throw warehouseStatusInvalid();
    const organizationId = context.organization.id;

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.warehouse.findFirst({
        where: { id: warehouseId, organizationId },
        select: WAREHOUSE_SELECT,
      });
      if (!current) throw warehouseNotFound();

      const data: Prisma.WarehouseUpdateInput = {};
      const changes: Record<string, Prisma.InputJsonValue> = {};
      if (input.name !== undefined && input.name !== current.name) {
        data.name = input.name;
        changes.name = { from: current.name, to: input.name };
      }
      if (input.address !== undefined && input.address !== current.address) {
        data.address = input.address;
        changes.address = { changed: true };
      }
      if (Object.keys(data).length === 0) {
        return this.read(tx, organizationId, current.id);
      }

      await tx.warehouse.update({ where: { id: current.id }, data });
      await recordActivity(tx, {
        organizationId,
        actorUserId: context.user.id,
        action: ActivityAction.WAREHOUSE_UPDATED,
        entityType: 'Warehouse',
        entityId: current.id,
        metadata: { code: current.code, changes },
      });
      return this.read(tx, organizationId, current.id);
    });
  }

  archive(context: OrganizationContext, warehouseId: string): Promise<WarehouseResponse> {
    return this.transition(context, warehouseId, false);
  }

  restore(context: OrganizationContext, warehouseId: string): Promise<WarehouseResponse> {
    return this.transition(context, warehouseId, true);
  }

  /**
   * Idempotent status change. The conditional update waits for stock
   * operations that hold a share lock on the warehouse, so an archive never
   * interleaves with a movement into or out of it.
   */
  private async transition(
    context: OrganizationContext,
    warehouseId: string,
    isActive: boolean,
  ): Promise<WarehouseResponse> {
    const organizationId = context.organization.id;

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.warehouse.findFirst({
        where: { id: warehouseId, organizationId },
        select: WAREHOUSE_SELECT,
      });
      if (!current) throw warehouseNotFound();

      if (current.isActive !== isActive) {
        const { count } = await tx.warehouse.updateMany({
          where: { id: current.id, organizationId, isActive: !isActive },
          data: { isActive },
        });
        if (count === 1) {
          await recordActivity(tx, {
            organizationId,
            actorUserId: context.user.id,
            action: isActive
              ? ActivityAction.WAREHOUSE_RESTORED
              : ActivityAction.WAREHOUSE_ARCHIVED,
            entityType: 'Warehouse',
            entityId: current.id,
            metadata: { name: current.name, code: current.code },
          });
        }
      }
      return this.read(tx, organizationId, current.id);
    });
  }

  private async read(
    client: Client,
    organizationId: string,
    warehouseId: string,
  ): Promise<WarehouseResponse> {
    const warehouse = await client.warehouse.findFirst({
      where: { id: warehouseId, organizationId },
      select: WAREHOUSE_SELECT,
    });
    if (!warehouse) throw warehouseNotFound();
    const totals = await this.totals(client, organizationId, warehouse.id);
    return { warehouse: toWarehouse(warehouse, totals.get(warehouse.id) ?? NO_STOCK) };
  }

  /** Products in stock and units per warehouse, from one GROUP BY over inventory. */
  private async totals(
    client: Client,
    organizationId: string,
    warehouseId?: string,
  ): Promise<Map<string, WarehouseTotals>> {
    const groups = await client.inventory.groupBy({
      by: ['warehouseId'],
      where: { organizationId, quantity: { gt: 0 }, ...(warehouseId ? { warehouseId } : {}) },
      _count: { _all: true },
      _sum: { quantity: true },
    });
    return new Map(
      groups.map((group) => [
        group.warehouseId,
        { productCount: group._count._all, totalUnits: group._sum.quantity ?? 0 },
      ]),
    );
  }
}
