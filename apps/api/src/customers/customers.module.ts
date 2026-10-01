import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { CustomersController } from './customers.controller.js';
import { CustomersService } from './customers.service.js';

/** Organization-scoped customers (Phase 7A). Authorization reuses OrganizationAccessGuard. */
@Module({
  imports: [OrganizationsModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
