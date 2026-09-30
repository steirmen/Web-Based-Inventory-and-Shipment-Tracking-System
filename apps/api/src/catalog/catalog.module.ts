import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

/**
 * Products & categories. Authorization reuses OrganizationAccessGuard and the
 * central permission map in @app/shared — there is no separate auth logic here.
 */
@Module({
  imports: [OrganizationsModule],
  controllers: [CategoriesController, ProductsController],
  providers: [CategoriesService, ProductsService],
})
export class CatalogModule {}
