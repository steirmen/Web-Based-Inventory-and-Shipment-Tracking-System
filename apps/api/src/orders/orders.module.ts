import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { OrderFulfillmentService } from './order-fulfillment.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

/**
 * Orders (Phase 7A): drafts, the lifecycle, and fulfillment. Stock changes go
 * through the inventory module's StockOperationsService, never around it.
 */
@Module({
  imports: [OrganizationsModule, InventoryModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderFulfillmentService],
})
export class OrdersModule {}
