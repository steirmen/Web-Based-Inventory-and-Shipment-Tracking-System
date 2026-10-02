import {
  CURRENCIES,
  type Currency,
  type DashboardSelectedPeriod,
  type InventoryReportResponse,
  type InventoryReportRow,
  type InventoryReportSortField,
  type Language,
  type MoneyAmount,
  type OrdersReportResponse,
  type OrdersReportRow,
  type OrdersReportSortField,
  type ProductStatus,
  REPORT_LIMITS,
  type SalesReportResponse,
  type SalesReportRow,
  type SalesReportSortField,
  type SalesReportStatus,
  type SortOrder,
} from '@app/shared';
import { Injectable } from '@nestjs/common';
import { escapeLikePattern } from '../common/validation/like-pattern.js';
import {
  availableCurrencies,
  chooseCurrency,
  type CurrencyCounts,
} from '../dashboard/currency-choice.js';
import { resolveDashboardPeriods } from '../dashboard/dashboard-period.js';
import { REALIZED_ORDER_SQL } from '../dashboard/sales-semantics.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { STOCK_STATUS_SQL, stockStatus } from '../inventory/inventory-mappers.js';
import type {
  InventoryReportQueryDto,
  OrdersReportQueryDto,
  SalesReportQueryDto,
} from './dto/report.dto.js';
import { EXPORT_LABELS } from './export/export-labels.js';
import type { ExportTable } from './export/export-table.js';
import { reportExportTooLarge, reportFilterNotFound } from './reports-errors.js';

const L = REPORT_LIMITS;
const Decimal = Prisma.Decimal;

const direction = (order: SortOrder | undefined, fallback: SortOrder) =>
  Prisma.raw((order ?? fallback) === 'desc' ? 'DESC' : 'ASC');

function paging(query: { page?: number; pageSize?: number }) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? L.pageSizeDefault;
  return { page, pageSize, skip: (page - 1) * pageSize };
}

const pagination = (page: number, pageSize: number, totalItems: number) => ({
  page,
  pageSize,
  totalItems,
  totalPages: Math.ceil(totalItems / pageSize),
});

const money = (value: string | Prisma.Decimal | null) => new Decimal(value ?? 0).toFixed(2);

/** Filters that name records of the organization (validated with the organization id). */
interface FilterIds {
  warehouseId?: string;
  customerId?: string;
  productId?: string;
  categoryId?: string;
}

// --- Sales -------------------------------------------------------------------------------

const SALES_SORT: Record<SalesReportSortField, Prisma.Sql> = {
  date: Prisma.sql`o.created_at`,
  orderNumber: Prisma.sql`o.order_number`,
  customer: Prisma.sql`c.name`,
  units: Prisma.sql`line.units`,
  revenue: Prisma.sql`line.revenue`,
};

interface SalesRow {
  orderId: string;
  orderNumber: string;
  date: Date;
  status: SalesReportStatus;
  customerId: string | null;
  customerName: string | null;
  customerCompany: string | null;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  warehouseActive: boolean;
  units: bigint;
  revenue: string;
  currency: Currency;
}

function toSalesRow(row: SalesRow): SalesReportRow {
  return {
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    date: row.date.toISOString(),
    status: row.status,
    customer: row.customerId
      ? { id: row.customerId, name: row.customerName!, companyName: row.customerCompany }
      : null,
    warehouse: {
      id: row.warehouseId,
      name: row.warehouseName,
      code: row.warehouseCode,
      isActive: row.warehouseActive,
    },
    units: Number(row.units),
    revenue: money(row.revenue),
    currency: row.currency,
  };
}

// --- Orders ------------------------------------------------------------------------------

const ORDER_REPORT_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  total: true,
  currency: true,
  createdAt: true,
  customer: { select: { id: true, name: true, companyName: true } },
  warehouse: { select: { id: true, name: true, code: true, isActive: true } },
  _count: { select: { items: true } },
} satisfies Prisma.OrderSelect;

type OrderReportRecord = Prisma.OrderGetPayload<{ select: typeof ORDER_REPORT_SELECT }>;

function ordersOrderBy(
  field: OrdersReportSortField,
  order: SortOrder,
): Prisma.OrderOrderByWithRelationInput[] {
  const tieBreak: Prisma.OrderOrderByWithRelationInput = { id: 'asc' };
  switch (field) {
    case 'orderNumber':
      return [{ orderNumber: order }, tieBreak];
    case 'customer':
      return [{ customer: { name: order } }, { createdAt: 'desc' }, tieBreak];
    case 'status':
      return [{ status: order }, { createdAt: 'desc' }, tieBreak];
    case 'total':
      return [{ total: order }, tieBreak];
    case 'createdAt':
      return [{ createdAt: order }, tieBreak];
  }
}

function toOrdersRow(row: OrderReportRecord): OrdersReportRow {
  return {
    orderId: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    customer: row.customer,
    warehouse: row.warehouse,
    itemCount: row._count.items,
    total: money(row.total),
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
  };
}

// --- Inventory ---------------------------------------------------------------------------

const INVENTORY_SORT: Record<InventoryReportSortField, Prisma.Sql> = {
  productName: Prisma.sql`p.name`,
  sku: Prisma.sql`p.sku`,
  category: Prisma.sql`cat.name`,
  warehouse: Prisma.sql`w.code`,
  quantity: Prisma.sql`i.quantity`,
  minimumStock: Prisma.sql`p.minimum_stock`,
};

interface InventoryRow {
  inventoryId: string;
  quantity: number;
  productId: string;
  productName: string;
  sku: string;
  productStatus: ProductStatus;
  minimumStock: number;
  categoryId: string | null;
  categoryName: string | null;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  warehouseActive: boolean;
}

function toInventoryRow(row: InventoryRow): InventoryReportRow {
  return {
    inventoryId: row.inventoryId,
    product: { id: row.productId, name: row.productName, sku: row.sku, status: row.productStatus },
    category: row.categoryId ? { id: row.categoryId, name: row.categoryName! } : null,
    warehouse: {
      id: row.warehouseId,
      name: row.warehouseName,
      code: row.warehouseCode,
      isActive: row.warehouseActive,
    },
    quantity: row.quantity,
    minimumStock: row.minimumStock,
    // The Phase 6 rule in TypeScript; the filter uses its SQL twin (STOCK_STATUS_SQL).
    status: stockStatus(row.quantity, row.minimumStock),
  };
}

/**
 * Read-only reports (Phase 8C). Every query is scoped to the guard-verified
 * organization and joins tenant tables on (organization_id, id); client ids
 * in filters are verified to belong to the organization; sorting maps
 * whitelisted fields to SQL; pages are capped at 100 rows and exports at
 * REPORT_LIMITS.exportMaxRows. The sales report uses the dashboard's
 * definitions (REALIZED_ORDER_SQL, line snapshots, local-day periods), the
 * inventory report the Phase 6 stock status.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Shared ------------------------------------------------------------------------------

  /** A foreign or unknown id in a filter is 422 REPORT_FILTER_NOT_FOUND (never another org's data). */
  private async assertFilters(organizationId: string, ids: FilterIds): Promise<void> {
    const checks: [keyof FilterIds, () => Promise<unknown>][] = [];
    const where = (id: string) => ({ where: { id, organizationId }, select: { id: true } });
    if (ids.warehouseId) {
      checks.push(['warehouseId', () => this.prisma.warehouse.findFirst(where(ids.warehouseId!))]);
    }
    if (ids.customerId) {
      checks.push(['customerId', () => this.prisma.customer.findFirst(where(ids.customerId!))]);
    }
    if (ids.productId) {
      checks.push(['productId', () => this.prisma.product.findFirst(where(ids.productId!))]);
    }
    if (ids.categoryId) {
      checks.push(['categoryId', () => this.prisma.category.findFirst(where(ids.categoryId!))]);
    }
    for (const [field, find] of checks) {
      if (!(await find())) throw reportFilterNotFound(field);
    }
  }

  private period(query: SalesReportQueryDto | OrdersReportQueryDto, now: Date) {
    return resolveDashboardPeriods(query, now).current;
  }

  /**
   * The sales report's currency: the requested one, else the currency with
   * the most orders matching the other filters (the dashboard's rule).
   */
  private async salesCurrency(
    organizationId: string,
    query: SalesReportQueryDto,
    period: DashboardSelectedPeriod,
  ): Promise<{ currency: Currency; currencies: Currency[] }> {
    const from = this.salesFrom(organizationId, query, period, null);
    const rows = await this.prisma.$queryRaw<{ currency: Currency; orders: number }[]>`
      SELECT o.currency::text AS currency, COUNT(*)::int AS orders
      ${from}
      GROUP BY o.currency`;
    const counts: CurrencyCounts = new Map(rows.map((row) => [row.currency, row.orders]));
    const currency = chooseCurrency(query.currency, counts);
    return { currency, currencies: availableCurrencies(currency, counts) };
  }

  // --- Sales -------------------------------------------------------------------------------

  private salesFrom(
    organizationId: string,
    query: SalesReportQueryDto,
    period: DashboardSelectedPeriod,
    /** Only orders in this currency (null: every currency, to list the currencies). */
    currency: Currency | null,
  ) {
    const lineFilters: Prisma.Sql[] = [];
    if (query.productId) lineFilters.push(Prisma.sql`AND oi.product_id = ${query.productId}::uuid`);
    if (query.categoryId) {
      lineFilters.push(Prisma.sql`AND oi.product_id IN (
        SELECT cp.id FROM products cp
        WHERE cp.organization_id = o.organization_id AND cp.category_id = ${query.categoryId}::uuid
      )`);
    }
    const narrowed = lineFilters.length > 0;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`o.organization_id = ${organizationId}::uuid`,
      Prisma.sql`o.created_at >= ${new Date(period.start)}::timestamptz`,
      Prisma.sql`o.created_at < ${new Date(period.end)}::timestamptz`,
      REALIZED_ORDER_SQL,
    ];
    if (currency) conditions.push(Prisma.sql`o.currency = ${currency}::currency`);
    if (query.status) conditions.push(Prisma.sql`o.status = ${query.status}::order_status`);
    if (query.warehouseId) conditions.push(Prisma.sql`o.warehouse_id = ${query.warehouseId}::uuid`);
    if (query.customerId) conditions.push(Prisma.sql`o.customer_id = ${query.customerId}::uuid`);
    if (query.search) {
      const pattern = `%${escapeLikePattern(query.search)}%`;
      conditions.push(Prisma.sql`(
        o.order_number ILIKE ${pattern} OR c.name ILIKE ${pattern} OR c.company_name ILIKE ${pattern}
        OR EXISTS (
          SELECT 1 FROM order_items s
          WHERE s.organization_id = o.organization_id AND s.order_id = o.id
            AND (s.product_name_snapshot ILIKE ${pattern} OR s.sku_snapshot ILIKE ${pattern})
        )
      )`);
    }

    // Units and revenue from the order's own lines (price snapshots); with a
    // product/category filter only the matching lines count.
    return Prisma.sql`
      FROM orders o
      JOIN LATERAL (
        SELECT COUNT(*) AS lines,
               COALESCE(SUM(oi.quantity), 0)::bigint AS units,
               COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS revenue
        FROM order_items oi
        WHERE oi.organization_id = o.organization_id AND oi.order_id = o.id
        ${lineFilters.length ? Prisma.join(lineFilters, ' ') : Prisma.empty}
      ) line ON ${narrowed ? Prisma.sql`line.lines > 0` : Prisma.sql`TRUE`}
      JOIN warehouses w ON w.organization_id = o.organization_id AND w.id = o.warehouse_id
      LEFT JOIN customers c ON c.organization_id = o.organization_id AND c.id = o.customer_id
      WHERE ${Prisma.join(conditions, ' AND ')}`;
  }

  private salesSelect(from: Prisma.Sql, query: SalesReportQueryDto, limit: number, offset: number) {
    const sortBy = query.sortBy ?? 'date';
    const dir = direction(query.sortOrder, 'desc');
    return this.prisma.$queryRaw<SalesRow[]>`
      SELECT o.id AS "orderId", o.order_number AS "orderNumber", o.created_at AS "date",
             o.status::text AS status,
             c.id AS "customerId", c.name AS "customerName", c.company_name AS "customerCompany",
             w.id AS "warehouseId", w.name AS "warehouseName", w.code AS "warehouseCode",
             w.is_active AS "warehouseActive",
             line.units AS units, line.revenue::text AS revenue, o.currency::text AS currency
      ${from}
      ORDER BY ${SALES_SORT[sortBy]} ${dir} NULLS LAST, o.created_at DESC, o.id ASC
      LIMIT ${limit} OFFSET ${offset}`;
  }

  async sales(
    organizationId: string,
    query: SalesReportQueryDto,
    now: Date = new Date(),
  ): Promise<SalesReportResponse> {
    const period = this.period(query, now);
    await this.assertFilters(organizationId, query);
    const { page, pageSize, skip } = paging(query);
    const { currency, currencies } = await this.salesCurrency(organizationId, query, period);
    const from = this.salesFrom(organizationId, query, period, currency);

    const [totals, rows] = await this.prisma.$transaction(
      [
        this.prisma.$queryRaw<{ orders: number; units: bigint; revenue: string }[]>`
          SELECT COUNT(*)::int AS orders, COALESCE(SUM(line.units), 0)::bigint AS units,
                 COALESCE(SUM(line.revenue), 0)::text AS revenue
          ${from}`,
        this.salesSelect(from, query, pageSize, skip),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const total = totals[0]!;
    return {
      period,
      currency,
      currencies,
      items: rows.map(toSalesRow),
      pagination: pagination(page, pageSize, total.orders),
      totals: { orders: total.orders, units: Number(total.units), revenue: money(total.revenue) },
    };
  }

  /** Every row of the sales report (same filters, currency, and order), for CSV or Excel. */
  async salesExport(
    organizationId: string,
    query: SalesReportQueryDto,
    lang: Language,
    now: Date = new Date(),
  ): Promise<ExportTable<SalesReportRow>> {
    const period = this.period(query, now);
    await this.assertFilters(organizationId, query);
    const { currency } = await this.salesCurrency(organizationId, query, period);
    const from = this.salesFrom(organizationId, query, period, currency);
    const rows = await this.salesSelect(from, query, L.exportMaxRows + 1, 0);
    await this.assertExportSize(
      rows.length,
      () => this.prisma.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count ${from}`,
    );

    const t = EXPORT_LABELS[lang];
    return {
      filename: `${t.file.sales}_${period.from}_${period.to}_${currency}`,
      sheetName: t.sheet.sales,
      timeZone: period.timeZone,
      rows: rows.map(toSalesRow),
      columns: [
        { kind: 'datetime', header: t.column.date(period.timeZone), value: (row) => row.date },
        { kind: 'text', header: t.column.orderNumber, value: (row) => row.orderNumber },
        { kind: 'text', header: t.column.status, value: (row) => t.orderStatus[row.status] },
        { kind: 'text', header: t.column.customer, value: (row) => row.customer?.name },
        { kind: 'text', header: t.column.company, value: (row) => row.customer?.companyName },
        { kind: 'text', header: t.column.warehouseCode, value: (row) => row.warehouse.code },
        { kind: 'text', header: t.column.warehouse, value: (row) => row.warehouse.name },
        { kind: 'integer', header: t.column.units, value: (row) => row.units },
        {
          kind: 'money',
          header: t.column.revenue,
          value: (row) => row.revenue,
          currency: (row) => row.currency,
        },
        { kind: 'text', header: t.column.currency, value: (row) => row.currency },
      ],
    };
  }

  // --- Orders ------------------------------------------------------------------------------

  private ordersWhere(
    organizationId: string,
    query: OrdersReportQueryDto,
    period: DashboardSelectedPeriod,
  ): Prisma.OrderWhereInput {
    const search = query.search ? escapeLikePattern(query.search) : undefined;
    return {
      organizationId,
      createdAt: { gte: new Date(period.start), lt: new Date(period.end) },
      ...(query.status ? { status: query.status } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(search
        ? {
            OR: [
              { orderNumber: { contains: search, mode: 'insensitive' } },
              { customer: { name: { contains: search, mode: 'insensitive' } } },
              { customer: { companyName: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
  }

  async orders(
    organizationId: string,
    query: OrdersReportQueryDto,
    now: Date = new Date(),
  ): Promise<OrdersReportResponse> {
    const period = this.period(query, now);
    await this.assertFilters(organizationId, query);
    const { page, pageSize, skip } = paging(query);
    const where = this.ordersWhere(organizationId, query, period);

    const [count, sums, rows] = await this.prisma.$transaction(
      [
        this.prisma.order.count({ where }),
        // Totals per currency: amounts in different currencies are never added together.
        this.prisma.order.groupBy({ by: ['currency'], where, _sum: { total: true } }),
        this.prisma.order.findMany({
          where,
          orderBy: ordersOrderBy(query.sortBy ?? 'createdAt', query.sortOrder ?? 'desc'),
          skip,
          take: pageSize,
          select: ORDER_REPORT_SELECT,
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const values: MoneyAmount[] = CURRENCIES.flatMap((currency) => {
      const sum = sums.find((row) => row.currency === currency);
      return sum ? [{ currency, amount: money(sum._sum.total) }] : [];
    });
    return {
      period,
      items: rows.map(toOrdersRow),
      pagination: pagination(page, pageSize, count),
      totals: { orders: count, values },
    };
  }

  /** Every row of the orders report (same filters and order), for CSV or Excel. */
  async ordersExport(
    organizationId: string,
    query: OrdersReportQueryDto,
    lang: Language,
    now: Date = new Date(),
  ): Promise<ExportTable<OrdersReportRow>> {
    const period = this.period(query, now);
    await this.assertFilters(organizationId, query);
    const where = this.ordersWhere(organizationId, query, period);
    const rows = await this.prisma.order.findMany({
      where,
      orderBy: ordersOrderBy(query.sortBy ?? 'createdAt', query.sortOrder ?? 'desc'),
      take: L.exportMaxRows + 1,
      select: ORDER_REPORT_SELECT,
    });
    await this.assertExportSize(rows.length, async () => [
      { count: await this.prisma.order.count({ where }) },
    ]);

    const t = EXPORT_LABELS[lang];
    return {
      filename: `${t.file.orders}_${period.from}_${period.to}`,
      sheetName: t.sheet.orders,
      timeZone: period.timeZone,
      rows: rows.map(toOrdersRow),
      columns: [
        { kind: 'text', header: t.column.orderNumber, value: (row) => row.orderNumber },
        { kind: 'text', header: t.column.status, value: (row) => t.orderStatus[row.status] },
        { kind: 'text', header: t.column.customer, value: (row) => row.customer?.name },
        { kind: 'text', header: t.column.company, value: (row) => row.customer?.companyName },
        { kind: 'text', header: t.column.warehouseCode, value: (row) => row.warehouse.code },
        { kind: 'text', header: t.column.warehouse, value: (row) => row.warehouse.name },
        { kind: 'integer', header: t.column.items, value: (row) => row.itemCount },
        {
          kind: 'money',
          header: t.column.total,
          value: (row) => row.total,
          currency: (row) => row.currency,
        },
        { kind: 'text', header: t.column.currency, value: (row) => row.currency },
        {
          kind: 'datetime',
          header: t.column.created(period.timeZone),
          value: (row) => row.createdAt,
        },
      ],
    };
  }

  // --- Inventory ---------------------------------------------------------------------------

  private inventoryFrom(organizationId: string, query: InventoryReportQueryDto) {
    const conditions: Prisma.Sql[] = [Prisma.sql`i.organization_id = ${organizationId}::uuid`];
    // Default scope = sellable stock, exactly the dashboard's stock KPIs.
    if (!query.includeArchived) {
      conditions.push(Prisma.sql`p.status = 'ACTIVE' AND w.is_active`);
    }
    if (query.warehouseId) conditions.push(Prisma.sql`i.warehouse_id = ${query.warehouseId}::uuid`);
    if (query.productId) conditions.push(Prisma.sql`i.product_id = ${query.productId}::uuid`);
    if (query.categoryId) conditions.push(Prisma.sql`p.category_id = ${query.categoryId}::uuid`);
    if (query.status) conditions.push(STOCK_STATUS_SQL[query.status]);
    if (query.search) {
      const pattern = `%${escapeLikePattern(query.search)}%`;
      conditions.push(Prisma.sql`(p.name ILIKE ${pattern} OR p.sku ILIKE ${pattern})`);
    }
    return Prisma.sql`
      FROM inventory i
      JOIN products p ON p.organization_id = i.organization_id AND p.id = i.product_id
      JOIN warehouses w ON w.organization_id = i.organization_id AND w.id = i.warehouse_id
      LEFT JOIN categories cat ON cat.organization_id = p.organization_id AND cat.id = p.category_id
      WHERE ${Prisma.join(conditions, ' AND ')}`;
  }

  private inventorySelect(
    from: Prisma.Sql,
    query: InventoryReportQueryDto,
    limit: number,
    offset: number,
  ) {
    const sortBy = query.sortBy ?? 'productName';
    const dir = direction(query.sortOrder, 'asc');
    return this.prisma.$queryRaw<InventoryRow[]>`
      SELECT i.id AS "inventoryId", i.quantity,
             p.id AS "productId", p.name AS "productName", p.sku, p.status::text AS "productStatus",
             p.minimum_stock AS "minimumStock",
             cat.id AS "categoryId", cat.name AS "categoryName",
             w.id AS "warehouseId", w.name AS "warehouseName", w.code AS "warehouseCode",
             w.is_active AS "warehouseActive"
      ${from}
      ORDER BY ${INVENTORY_SORT[sortBy]} ${dir} NULLS LAST, p.name ASC, w.code ASC, i.id ASC
      LIMIT ${limit} OFFSET ${offset}`;
  }

  async inventory(
    organizationId: string,
    query: InventoryReportQueryDto,
  ): Promise<InventoryReportResponse> {
    await this.assertFilters(organizationId, query);
    const { page, pageSize, skip } = paging(query);
    const from = this.inventoryFrom(organizationId, query);

    const [totals, rows] = await this.prisma.$transaction(
      [
        this.prisma.$queryRaw<
          { rows: number; units: bigint; inStock: number; lowStock: number; outOfStock: number }[]
        >`
          SELECT COUNT(*)::int AS rows, COALESCE(SUM(i.quantity), 0)::bigint AS units,
                 COUNT(*) FILTER (WHERE ${STOCK_STATUS_SQL.IN_STOCK})::int AS "inStock",
                 COUNT(*) FILTER (WHERE ${STOCK_STATUS_SQL.LOW_STOCK})::int AS "lowStock",
                 COUNT(*) FILTER (WHERE ${STOCK_STATUS_SQL.OUT_OF_STOCK})::int AS "outOfStock"
          ${from}`,
        this.inventorySelect(from, query, pageSize, skip),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const total = totals[0]!;
    return {
      items: rows.map(toInventoryRow),
      pagination: pagination(page, pageSize, total.rows),
      totals: { ...total, units: Number(total.units) },
    };
  }

  /** Every row of the inventory report (same filters and order), for CSV or Excel. */
  async inventoryExport(
    organizationId: string,
    query: InventoryReportQueryDto,
    lang: Language,
    now: Date = new Date(),
  ): Promise<ExportTable<InventoryReportRow>> {
    await this.assertFilters(organizationId, query);
    const from = this.inventoryFrom(organizationId, query);
    const rows = await this.inventorySelect(from, query, L.exportMaxRows + 1, 0);
    await this.assertExportSize(
      rows.length,
      () => this.prisma.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count ${from}`,
    );

    const t = EXPORT_LABELS[lang];
    return {
      filename: `${t.file.inventory}_${now.toISOString().slice(0, 10)}`,
      sheetName: t.sheet.inventory,
      timeZone: 'UTC',
      rows: rows.map(toInventoryRow),
      columns: [
        { kind: 'text', header: t.column.product, value: (row) => row.product.name },
        { kind: 'text', header: t.column.sku, value: (row) => row.product.sku },
        { kind: 'text', header: t.column.category, value: (row) => row.category?.name },
        { kind: 'text', header: t.column.warehouseCode, value: (row) => row.warehouse.code },
        { kind: 'text', header: t.column.warehouse, value: (row) => row.warehouse.name },
        { kind: 'integer', header: t.column.quantity, value: (row) => row.quantity },
        { kind: 'integer', header: t.column.minimumStock, value: (row) => row.minimumStock },
        { kind: 'text', header: t.column.stockStatus, value: (row) => t.stockStatus[row.status] },
        {
          kind: 'text',
          header: t.column.productStatus,
          value: (row) => (row.product.status === 'ACTIVE' ? t.active : t.archived),
        },
        {
          kind: 'text',
          header: t.column.warehouseStatus,
          value: (row) => (row.warehouse.isActive ? t.active : t.archived),
        },
      ],
    };
  }

  /** Exports are bounded: more than REPORT_LIMITS.exportMaxRows rows is a 422 asking for narrower filters. */
  private async assertExportSize(
    fetched: number,
    count: () => Promise<{ count: number }[]>,
  ): Promise<void> {
    if (fetched <= L.exportMaxRows) return;
    const [total] = await count();
    throw reportExportTooLarge(total?.count ?? fetched);
  }
}
