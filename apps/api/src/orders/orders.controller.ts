import type { OrderListResponse, OrderResponse } from '@app/shared';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
import { CreateOrderDto, OrderListQueryDto, UpdateOrderDto } from './dto/order.dto.js';
import { orderNotFound } from './order-errors.js';
import { OrderFulfillmentService } from './order-fulfillment.service.js';
import { OrdersService } from './orders.service.js';

const orderId = () => new ResourceIdPipe(orderNotFound);

/**
 * Orders. There is no generic status field: each lifecycle step has its own
 * route, checked against the state machine under the order row lock. There is
 * no DELETE: drafts are cancelled, and orders are kept for history.
 */
@Controller('organizations/:organizationId/orders')
@UseGuards(OrganizationAccessGuard)
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly fulfillment: OrderFulfillmentService,
  ) {}

  @Get()
  @RequirePermissions('ORDERS_READ')
  list(
    @OrgContext() context: OrganizationContext,
    @Query() query: OrderListQueryDto,
  ): Promise<OrderListResponse> {
    return this.orders.list(context.organization.id, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ORDERS_CREATE')
  create(
    @OrgContext() context: OrganizationContext,
    @Body() body: CreateOrderDto,
  ): Promise<OrderResponse> {
    return this.orders.create(context, body);
  }

  @Get(':orderId')
  @RequirePermissions('ORDERS_READ')
  get(
    @OrgContext() context: OrganizationContext,
    @Param('orderId', orderId()) id: string,
  ): Promise<OrderResponse> {
    return this.orders.get(context.organization.id, id);
  }

  /** Draft edits only (409 ORDER_NOT_EDITABLE otherwise). */
  @Patch(':orderId')
  @RequirePermissions('ORDERS_UPDATE')
  update(
    @OrgContext() context: OrganizationContext,
    @Param('orderId', orderId()) id: string,
    @Body() body: UpdateOrderDto,
  ): Promise<OrderResponse> {
    return this.orders.update(context, id, body);
  }

  @Post(':orderId/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ORDERS_CONFIRM')
  confirm(
    @OrgContext() context: OrganizationContext,
    @Param('orderId', orderId()) id: string,
  ): Promise<OrderResponse> {
    return this.orders.confirm(context, id);
  }

  /** Deducts stock: one SALE movement per line, all or nothing. */
  @Post(':orderId/process')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ORDERS_PROCESS')
  process(
    @OrgContext() context: OrganizationContext,
    @Param('orderId', orderId()) id: string,
  ): Promise<OrderResponse> {
    return this.fulfillment.process(context, id);
  }

  @Post(':orderId/ship')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ORDERS_SHIP')
  ship(
    @OrgContext() context: OrganizationContext,
    @Param('orderId', orderId()) id: string,
  ): Promise<OrderResponse> {
    return this.orders.transition(context, id, 'SHIPPED');
  }

  @Post(':orderId/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ORDERS_COMPLETE')
  complete(
    @OrgContext() context: OrganizationContext,
    @Param('orderId', orderId()) id: string,
  ): Promise<OrderResponse> {
    return this.orders.transition(context, id, 'COMPLETED');
  }

  /** Only before stock was deducted (DRAFT or CONFIRMED). */
  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ORDERS_CANCEL')
  cancel(
    @OrgContext() context: OrganizationContext,
    @Param('orderId', orderId()) id: string,
  ): Promise<OrderResponse> {
    return this.orders.transition(context, id, 'CANCELLED');
  }
}
