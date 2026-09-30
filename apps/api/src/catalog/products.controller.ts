import type { ProductListResponse, ProductResponse } from '@app/shared';
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
import { productNotFound } from './catalog-errors.js';
import { CreateProductDto, ProductListQueryDto, UpdateProductDto } from './dto/product.dto.js';
import { ProductsService } from './products.service.js';

const productId = () => new ResourceIdPipe(productNotFound);

/**
 * Products are archived, never deleted: there is intentionally no DELETE route.
 * Membership is verified for every route by OrganizationAccessGuard.
 */
@Controller('organizations/:organizationId/products')
@UseGuards(OrganizationAccessGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions('PRODUCTS_READ')
  list(
    @OrgContext() context: OrganizationContext,
    @Query() query: ProductListQueryDto,
  ): Promise<ProductListResponse> {
    return this.products.list(context.organization.id, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('PRODUCTS_CREATE')
  create(
    @OrgContext() context: OrganizationContext,
    @Body() body: CreateProductDto,
  ): Promise<ProductResponse> {
    return this.products.create(context, body);
  }

  @Get(':productId')
  @RequirePermissions('PRODUCTS_READ')
  get(
    @OrgContext() context: OrganizationContext,
    @Param('productId', productId()) id: string,
  ): Promise<ProductResponse> {
    return this.products.get(context.organization.id, id);
  }

  @Patch(':productId')
  @RequirePermissions('PRODUCTS_UPDATE')
  update(
    @OrgContext() context: OrganizationContext,
    @Param('productId', productId()) id: string,
    @Body() body: UpdateProductDto,
  ): Promise<ProductResponse> {
    return this.products.update(context, id, body);
  }

  @Post(':productId/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('PRODUCTS_ARCHIVE')
  archive(
    @OrgContext() context: OrganizationContext,
    @Param('productId', productId()) id: string,
  ): Promise<ProductResponse> {
    return this.products.archive(context, id);
  }

  @Post(':productId/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('PRODUCTS_ARCHIVE')
  restore(
    @OrgContext() context: OrganizationContext,
    @Param('productId', productId()) id: string,
  ): Promise<ProductResponse> {
    return this.products.restore(context, id);
  }
}
