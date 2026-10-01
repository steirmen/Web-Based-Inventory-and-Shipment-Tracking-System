import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

/** Organization-scoped, read-only reports with CSV export (Phase 8C). Authorization reuses OrganizationAccessGuard. */
@Module({
  imports: [OrganizationsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
