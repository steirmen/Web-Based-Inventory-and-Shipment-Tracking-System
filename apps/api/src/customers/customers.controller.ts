import type { CustomerListResponse, CustomerResponse } from '@app/shared';
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
import { customerNotFound } from './customer-errors.js';
import { CustomersService } from './customers.service.js';
import { CreateCustomerDto, CustomerListQueryDto, UpdateCustomerDto } from './dto/customer.dto.js';

const customerId = () => new ResourceIdPipe(customerNotFound);

/** Customers are archived, never deleted: there is intentionally no DELETE route. */
@Controller('organizations/:organizationId/customers')
@UseGuards(OrganizationAccessGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions('CUSTOMERS_READ')
  list(
    @OrgContext() context: OrganizationContext,
    @Query() query: CustomerListQueryDto,
  ): Promise<CustomerListResponse> {
    return this.customers.list(context.organization.id, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('CUSTOMERS_CREATE')
  create(
    @OrgContext() context: OrganizationContext,
    @Body() body: CreateCustomerDto,
  ): Promise<CustomerResponse> {
    return this.customers.create(context, body);
  }

  @Get(':customerId')
  @RequirePermissions('CUSTOMERS_READ')
  get(
    @OrgContext() context: OrganizationContext,
    @Param('customerId', customerId()) id: string,
  ): Promise<CustomerResponse> {
    return this.customers.get(context.organization.id, id);
  }

  @Patch(':customerId')
  @RequirePermissions('CUSTOMERS_UPDATE')
  update(
    @OrgContext() context: OrganizationContext,
    @Param('customerId', customerId()) id: string,
    @Body() body: UpdateCustomerDto,
  ): Promise<CustomerResponse> {
    return this.customers.update(context, id, body);
  }

  @Post(':customerId/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('CUSTOMERS_ARCHIVE')
  archive(
    @OrgContext() context: OrganizationContext,
    @Param('customerId', customerId()) id: string,
  ): Promise<CustomerResponse> {
    return this.customers.archive(context, id);
  }

  @Post(':customerId/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('CUSTOMERS_ARCHIVE')
  restore(
    @OrgContext() context: OrganizationContext,
    @Param('customerId', customerId()) id: string,
  ): Promise<CustomerResponse> {
    return this.customers.restore(context, id);
  }
}
