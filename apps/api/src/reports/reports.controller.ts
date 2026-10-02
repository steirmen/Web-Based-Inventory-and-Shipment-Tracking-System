import type {
  InventoryReportResponse,
  OrdersReportResponse,
  SalesReportResponse,
} from '@app/shared';
import { Controller, Get, Header, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { OrganizationAccessGuard } from '../organizations/organization-access.guard.js';
import {
  type OrganizationContext,
  OrgContext,
  RequirePermissions,
} from '../organizations/organization-context.js';
import {
  InventoryReportExportQueryDto,
  InventoryReportQueryDto,
  OrdersReportExportQueryDto,
  OrdersReportQueryDto,
  SalesReportExportQueryDto,
  SalesReportQueryDto,
} from './dto/report.dto.js';
import { type ExportTable, renderExport } from './export/export-table.js';
import { ReportsService } from './reports.service.js';

/**
 * Sends a download: CSV (default) or Excel (`format=xlsx`), labels in `lang`.
 * The filename is ASCII and also readable cross-origin.
 */
function sendExport<Row>(
  response: Response,
  table: ExportTable<Row>,
  query: { format?: 'csv' | 'xlsx' },
): string | StreamableFile {
  const file = renderExport(table, query.format ?? 'csv');
  response.setHeader('Content-Type', file.contentType);
  response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  response.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  // A Buffer must be streamed: Nest would serialize a returned Buffer as JSON.
  return typeof file.body === 'string' ? file.body : new StreamableFile(file.body);
}

/**
 * Read-only reports and their exports (CSV or Excel). The organization comes
 * only from the route (OrganizationAccessGuard: non-members get 404); exports
 * take the same query as the report they export, plus `format` and `lang`.
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
    @Query() query: SalesReportExportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string | StreamableFile> {
    const { format, lang, ...report } = query;
    const table = await this.reports.salesExport(context.organization.id, report, lang ?? 'en');
    return sendExport(response, table, { format });
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
    @Query() query: OrdersReportExportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string | StreamableFile> {
    const { format, lang, ...report } = query;
    const table = await this.reports.ordersExport(context.organization.id, report, lang ?? 'en');
    return sendExport(response, table, { format });
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
    @Query() query: InventoryReportExportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string | StreamableFile> {
    const { format, lang, ...report } = query;
    const table = await this.reports.inventoryExport(context.organization.id, report, lang ?? 'en');
    return sendExport(response, table, { format });
  }
}
