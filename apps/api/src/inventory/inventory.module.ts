import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';
import { StockMovementsController } from './stock-movements.controller.js';
import { StockOperationsService } from './stock-operations.service.js';
import { WarehousesController } from './warehouses.controller.js';
import { WarehousesService } from './warehouses.service.js';

/**
 * Warehouses, inventory (current stock), and stock movements (immutable
 * history). Authorization reuses OrganizationAccessGuard and the central
 * permission map in @app/shared.
 */
@Module({
  imports: [OrganizationsModule],
  controllers: [WarehousesController, InventoryController, StockMovementsController],
  providers: [WarehousesService, InventoryService, StockOperationsService],
})
export class InventoryModule {}
