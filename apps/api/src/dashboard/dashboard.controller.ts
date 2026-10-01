import type { DashboardSummaryResponse } from '@app/shared';
import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { OrganizationAccessGuard } from '../organizations/organization-access.guard.js';
import {
  type OrganizationContext,
  OrgContext,
  RequirePermissions,
} from '../organizations/organization-context.js';
import { DashboardService } from './dashboard.service.js';
import { DashboardSummaryQueryDto } from './dto/dashboard.dto.js';

/**
 * Read-only dashboard aggregates. The organization comes only from the route,
 * verified by OrganizationAccessGuard (non-members get 404).
 */
@Controller('organizations/:organizationId/dashboard')
@UseGuards(OrganizationAccessGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @RequirePermissions('DASHBOARD_READ')
  @Header('Cache-Control', 'no-store')
  summary(
    @OrgContext() context: OrganizationContext,
    @Query() query: DashboardSummaryQueryDto,
  ): Promise<DashboardSummaryResponse> {
    return this.dashboard.summary(context.organization.id, query);
  }
}
