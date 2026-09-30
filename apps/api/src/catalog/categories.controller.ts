import type { CategoryListResponse, CategoryResponse } from '@app/shared';
import {
  Body,
  Controller,
  Delete,
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
import { CategoriesService } from './categories.service.js';
import { categoryNotFound } from './catalog-errors.js';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto.js';

/** Membership is verified for every route by OrganizationAccessGuard. */
@Controller('organizations/:organizationId/categories')
@UseGuards(OrganizationAccessGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @RequirePermissions('CATEGORIES_READ')
  list(@OrgContext() context: OrganizationContext): Promise<CategoryListResponse> {
    return this.categories.list(context.organization.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('CATEGORIES_CREATE')
  create(
    @OrgContext() context: OrganizationContext,
    @Body() body: CreateCategoryDto,
  ): Promise<CategoryResponse> {
    return this.categories.create(context, body);
  }

  @Patch(':categoryId')
  @RequirePermissions('CATEGORIES_UPDATE')
  update(
    @OrgContext() context: OrganizationContext,
    @Param('categoryId', new ResourceIdPipe(categoryNotFound)) categoryId: string,
    @Body() body: UpdateCategoryDto,
  ): Promise<CategoryResponse> {
    return this.categories.update(context, categoryId, body);
  }

  @Delete(':categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('CATEGORIES_DELETE')
  remove(
    @OrgContext() context: OrganizationContext,
    @Param('categoryId', new ResourceIdPipe(categoryNotFound)) categoryId: string,
  ): Promise<void> {
    return this.categories.remove(context, categoryId);
  }
}
