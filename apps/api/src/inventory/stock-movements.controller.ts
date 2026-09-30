import type { StockMovementListResponse } from '@app/shared';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OrganizationAccessGuard } from '../organizations/organization-access.guard.js';
import {
  type OrganizationContext,
  OrgContext,
  RequirePermissions,
} from '../organizations/organization-context.js';
import { StockMovementListQueryDto } from './dto/inventory.dto.js';
import { InventoryService } from './inventory.service.js';

/**
 * The stock ledger. Movements are append-only: they are created only by stock
 * operations, and there are deliberately no update or delete routes.
 */
@Controller('organizations/:organizationId/stock-movements')
@UseGuards(OrganizationAccessGuard)
export class StockMovementsController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @RequirePermissions('STOCK_MOVEMENTS_READ')
  list(
    @OrgContext() context: OrganizationContext,
    @Query() query: StockMovementListQueryDto,
  ): Promise<StockMovementListResponse> {
    return this.inventory.listMovements(context.organization.id, query);
  }
}
