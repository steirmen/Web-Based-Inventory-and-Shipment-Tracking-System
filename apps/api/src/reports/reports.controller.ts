import type {
  InventoryReportResponse,
  OrdersReportResponse,
  SalesReportResponse,
} from '@app/shared';
import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { OrganizationAccessGuard } from '../organizations/organization-access.guard.js';
import {
  type OrganizationContext,
  OrgContext,
  RequirePermissions,
} from '../organizations/organization-context.js';
import {
  InventoryReportQueryDto,
  OrdersReportQueryDto,
  SalesReportQueryDto,
} from './dto/report.dto.js';
import { type CsvFile, ReportsService } from './reports.service.js';

/** Sends a CSV download (the filename is also readable cross-origin). */
function sendCsv(response: Response, file: CsvFile): string {
  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  response.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return file.csv;
}

/**
 * Read-only reports and their CSV exports. The organization comes only from
 * the route (OrganizationAccessGuard: non-members get 404); exports take the
 * same query as the report they export.
 */
@Controller('organizations/:organizationId/reports')
@UseGuards(OrganizationAccessGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  @RequirePermissions('REPORTS_READ')
  @Header('Cache-Control', 'no-store')
  sales(
    @OrgContext() context: OrganizationContext,
    @Query() query: SalesReportQueryDto,
  ): Promise<SalesReportResponse> {
    return this.reports.sales(context.organization.id, query);
  }

  @Get('sales/export')
  @RequirePermissions('REPORTS_EXPORT')
  async salesExport(
    @OrgContext() context: OrganizationContext,
    @Query() query: SalesReportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    return sendCsv(response, await this.reports.salesCsv(context.organization.id, query));
  }

  @Get('orders')
  @RequirePermissions('REPORTS_READ')
  @Header('Cache-Control', 'no-store')
  orders(
    @OrgContext() context: OrganizationContext,
    @Query() query: OrdersReportQueryDto,
  ): Promise<OrdersReportResponse> {
    return this.reports.orders(context.organization.id, query);
  }

  @Get('orders/export')
  @RequirePermissions('REPORTS_EXPORT')
  async ordersExport(
    @OrgContext() context: OrganizationContext,
    @Query() query: OrdersReportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    return sendCsv(response, await this.reports.ordersCsv(context.organization.id, query));
  }

  @Get('inventory')
  @RequirePermissions('REPORTS_READ')
  @Header('Cache-Control', 'no-store')
  inventory(
    @OrgContext() context: OrganizationContext,
    @Query() query: InventoryReportQueryDto,
  ): Promise<InventoryReportResponse> {
    return this.reports.inventory(context.organization.id, query);
  }

  @Get('inventory/export')
  @RequirePermissions('REPORTS_EXPORT')
  async inventoryExport(
    @OrgContext() context: OrganizationContext,
    @Query() query: InventoryReportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    return sendCsv(response, await this.reports.inventoryCsv(context.organization.id, query));
  }
}
