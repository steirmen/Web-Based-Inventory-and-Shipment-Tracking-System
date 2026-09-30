import type { WarehouseListResponse, WarehouseResponse } from '@app/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ResourceIdPipe } from '../common/validation/uuid.js';
import { OrganizationAccessGuard } from '../organizations/organization-access.guard.js';
import {
  type OrganizationContext,
  OrgContext,
  RequirePermissions,
} from '../organizations/organization-context.js';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto.js';
import { warehouseNotFound } from './inventory-errors.js';
import { WarehousesService } from './warehouses.service.js';

const warehouseId = () => new ResourceIdPipe(warehouseNotFound);

/** Warehouses are archived, never deleted: there is intentionally no DELETE route. */
@Controller('organizations/:organizationId/warehouses')
@UseGuards(OrganizationAccessGuard)
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Get()
  @RequirePermissions('WAREHOUSES_READ')
  list(@OrgContext() context: OrganizationContext): Promise<WarehouseListResponse> {
    return this.warehouses.list(context.organization.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('WAREHOUSES_CREATE')
  create(
    @OrgContext() context: OrganizationContext,
    @Body() body: CreateWarehouseDto,
  ): Promise<WarehouseResponse> {
    return this.warehouses.create(context, body);
  }

  @Get(':warehouseId')
  @RequirePermissions('WAREHOUSES_READ')
  get(
    @OrgContext() context: OrganizationContext,
    @Param('warehouseId', warehouseId()) id: string,
  ): Promise<WarehouseResponse> {
    return this.warehouses.get(context.organization.id, id);
  }

  @Patch(':warehouseId')
  @RequirePermissions('WAREHOUSES_UPDATE')
  update(
    @OrgContext() context: OrganizationContext,
    @Param('warehouseId', warehouseId()) id: string,
    @Body() body: UpdateWarehouseDto,
  ): Promise<WarehouseResponse> {
    return this.warehouses.update(context, id, body);
  }

  @Post(':warehouseId/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('WAREHOUSES_ARCHIVE')
  archive(
    @OrgContext() context: OrganizationContext,
    @Param('warehouseId', warehouseId()) id: string,
  ): Promise<WarehouseResponse> {
    return this.warehouses.archive(context, id);
  }

  @Post(':warehouseId/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('WAREHOUSES_ARCHIVE')
  restore(
    @OrgContext() context: OrganizationContext,
    @Param('warehouseId', warehouseId()) id: string,
  ): Promise<WarehouseResponse> {
    return this.warehouses.restore(context, id);
  }
}
