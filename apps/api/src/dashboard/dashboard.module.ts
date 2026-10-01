import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

/** Organization-scoped, read-only dashboard aggregates (Phase 8A). Authorization reuses OrganizationAccessGuard. */
@Module({
  imports: [OrganizationsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
