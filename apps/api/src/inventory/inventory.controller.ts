import type {
  AdjustStockResponse,
  InventoryListResponse,
  InventoryResponse,
  StockMovementListResponse,
  StockOperationResponse,
  TransferStockResponse,
} from '@app/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ResourceIdPipe } from '../common/validation/uuid.js';
import { OrganizationAccessGuard } from '../organizations/organization-access.guard.js';
import {
  type OrganizationContext,
  OrgContext,
  RequirePermissions,
} from '../organizations/organization-context.js';
import {
  AdjustStockDto,
  DamageStockDto,
  InventoryListQueryDto,
  PageQueryDto,
  StockQuantityDto,
  TransferStockDto,
} from './dto/inventory.dto.js';
import { inventoryNotFound } from './inventory-errors.js';
import { InventoryService } from './inventory.service.js';
import { StockOperationsService } from './stock-operations.service.js';

const inventoryId = () => new ResourceIdPipe(inventoryNotFound);

/**
 * Current stock and the operations that change it. Every operation writes the
 * inventory row and its stock movement in one transaction. Operations answer
 * 200 with the resulting inventory and movement(s).
 */
@Controller('organizations/:organizationId/inventory')
@UseGuards(OrganizationAccessGuard)
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly operations: StockOperationsService,
  ) {}

  @Get()
  @RequirePermissions('INVENTORY_READ')
  list(
    @OrgContext() context: OrganizationContext,
    @Query() query: InventoryListQueryDto,
  ): Promise<InventoryListResponse> {
    return this.inventory.list(context.organization.id, query);
  }

  @Post('receive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('INVENTORY_RECEIVE')
  receive(
    @OrgContext() context: OrganizationContext,
    @Body() body: StockQuantityDto,
  ): Promise<StockOperationResponse> {
    return this.operations.receive(context, body);
  }

  @Post('issue')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('INVENTORY_ISSUE')
  issue(
    @OrgContext() context: OrganizationContext,
    @Body() body: StockQuantityDto,
  ): Promise<StockOperationResponse> {
    return this.operations.issue(context, body);
  }

  @Post('damage')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('INVENTORY_ISSUE')
  damage(
    @OrgContext() context: OrganizationContext,
    @Body() body: DamageStockDto,
  ): Promise<StockOperationResponse> {
    return this.operations.damage(context, body);
  }

  @Post('adjust')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('INVENTORY_ADJUST')
  adjust(
    @OrgContext() context: OrganizationContext,
    @Body() body: AdjustStockDto,
  ): Promise<AdjustStockResponse> {
    return this.operations.adjust(context, body);
  }

  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('INVENTORY_TRANSFER')
  transfer(
    @OrgContext() context: OrganizationContext,
    @Body() body: TransferStockDto,
  ): Promise<TransferStockResponse> {
    return this.operations.transfer(context, body);
  }

  @Get(':inventoryId')
  @RequirePermissions('INVENTORY_READ')
  get(
    @OrgContext() context: OrganizationContext,
    @Param('inventoryId', inventoryId()) id: string,
  ): Promise<InventoryResponse> {
    return this.inventory.get(context.organization.id, id);
  }

  /** Read-only history. Movements are immutable: there is no route that changes one. */
  @Get(':inventoryId/movements')
  @RequirePermissions('INVENTORY_READ', 'STOCK_MOVEMENTS_READ')
  movements(
    @OrgContext() context: OrganizationContext,
    @Param('inventoryId', inventoryId()) id: string,
    @Query() query: PageQueryDto,
  ): Promise<StockMovementListResponse> {
    return this.inventory.movements(context.organization.id, id, query);
  }
}
