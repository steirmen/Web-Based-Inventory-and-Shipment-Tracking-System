import {
  DASHBOARD_LIMITS,
  type DashboardCountMetric,
  type DashboardMoneyMetric,
  type DashboardSummaryResponse,
  type DashboardTopProduct,
  type DashboardWarehouseSummary,
  ORDER_STATUSES,
  type OrderStatus,
  type ProductStatus,
  REALIZED_ORDER_STATUSES,
} from '@app/shared';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { STOCK_STATUS_SQL } from '../inventory/inventory-mappers.js';
import { REALIZED_ORDER_SQL } from './sales-semantics.js';
import {
  BUCKET_UNIT,
  dashboardBuckets,
  type DashboardPeriodInput,
  resolveDashboardPeriods,
} from './dashboard-period.js';

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/**
 * Realized revenue of order `o`, from its own lines: Σ quantity × unit price
 * (the price snapshot taken when the line was added — never the current
 * product price). NULL for orders that are not realized, so they add nothing.
 */
const REALIZED_REVENUE_JOIN = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT SUM(oi.quantity * oi.unit_price) AS revenue
    FROM order_items oi
    WHERE oi.organization_id = o.organization_id AND oi.order_id = o.id AND ${REALIZED_ORDER_SQL}
  ) line ON TRUE`;

interface RecentOrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: string;
  createdAt: Date;
  customerId: string | null;
  customerName: string | null;
  customerCompany: string | null;
}

interface StatusRow {
  status: OrderStatus;
  isCurrent: boolean;
  orders: number;
  revenue: string;
}
interface BucketRow {
  bucket: string;
  orders: number;
  realizedOrders: number;
  revenue: string;
}
interface TopProductRow {
  productId: string;
  name: string;
  sku: string;
  status: ProductStatus;
  unitsSold: bigint;
  revenue: string;
}
interface CountsRow {
  activeCustomers: number;
  archivedCustomers: number;
  newCustomers: number;
  newCustomersPrevious: number;
  activeProducts: number;
  archivedProducts: number;
}
interface WarehouseRow {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  totalUnits: bigint;
  inStockItems: number;
  lowStockItems: number;
  outOfStockItems: number;
}

const money = (value: Decimal) => value.toFixed(2);

/** null when there is nothing to compare with (previous = 0): never Infinity or NaN. */
function percentage(current: Decimal, previous: Decimal): number | null {
  if (previous.isZero()) return null;
  return current.minus(previous).div(previous).mul(100).toDecimalPlaces(1).toNumber();
}

function countMetric(current: number, previous: number): DashboardCountMetric {
  return {
    current,
    previous,
    absoluteChange: current - previous,
    percentageChange: percentage(new Decimal(current), new Decimal(previous)),
  };
}

function moneyMetric(current: Decimal, previous: Decimal): DashboardMoneyMetric {
  return {
    current: money(current),
    previous: money(previous),
    absoluteChange: money(current.minus(previous)),
    percentageChange: percentage(current, previous),
  };
}

/**
 * Read-only dashboard aggregates for one organization (Phase 8A). Every query
 * is filtered by the organization id from the guard-verified context and
 * joins tenant tables on (organization_id, id). Six queries (five grouped,
 * one LIMIT 5) answer the whole summary — none per KPI, status, product, or warehouse — and run
 * in one REPEATABLE READ transaction so all numbers come from one snapshot.
 * Money is summed by PostgreSQL (numeric) and handled as Decimal strings.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(
    organizationId: string,
    query: DashboardPeriodInput,
    now: Date = new Date(),
  ): Promise<DashboardSummaryResponse> {
    const { current, previous, bucket } = resolveDashboardPeriods(query, now);
    const org = Prisma.sql`${organizationId}::uuid`;
    const start = new Date(current.start);
    const end = new Date(current.end);
    const previousStart = new Date(previous.start);
    const inPeriod = Prisma.sql`o.created_at >= ${start}::timestamptz AND o.created_at < ${end}::timestamptz`;

    const [statusRows, bucketRows, topRows, countRows, warehouseRows, recentRows] =
      await this.prisma.$transaction(
        [
          // 1. Orders and realized revenue per status, for the period and the comparison period.
          this.prisma.$queryRaw<StatusRow[]>`
            SELECT o.status::text AS status,
                   (o.created_at >= ${start}::timestamptz) AS "isCurrent",
                   COUNT(*)::int AS orders,
                   COALESCE(SUM(line.revenue), 0)::text AS revenue
            FROM orders o
            ${REALIZED_REVENUE_JOIN}
            WHERE o.organization_id = ${org}
              AND o.created_at >= ${previousStart}::timestamptz
              AND o.created_at < ${end}::timestamptz
            GROUP BY o.status, "isCurrent"`,
          // 2. Time series: buckets of local days in the requested time zone.
          this.prisma.$queryRaw<BucketRow[]>`
            SELECT to_char(
                     date_trunc(${BUCKET_UNIT[bucket]}, o.created_at AT TIME ZONE ${current.timeZone}),
                     'YYYY-MM-DD'
                   ) AS bucket,
                   COUNT(*)::int AS orders,
                   COUNT(*) FILTER (WHERE ${REALIZED_ORDER_SQL})::int AS "realizedOrders",
                   COALESCE(SUM(line.revenue), 0)::text AS revenue
            FROM orders o
            ${REALIZED_REVENUE_JOIN}
            WHERE o.organization_id = ${org} AND ${inPeriod}
            GROUP BY bucket`,
          // 3. Top products by units sold in realized orders (amounts from line snapshots).
          this.prisma.$queryRaw<TopProductRow[]>`
            SELECT oi.product_id AS "productId", p.name, p.sku, p.status::text AS status,
                   SUM(oi.quantity)::bigint AS "unitsSold",
                   SUM(oi.quantity * oi.unit_price)::text AS revenue
            FROM order_items oi
            JOIN orders o ON o.organization_id = oi.organization_id AND o.id = oi.order_id
            JOIN products p ON p.organization_id = oi.organization_id AND p.id = oi.product_id
            WHERE oi.organization_id = ${org} AND ${inPeriod} AND ${REALIZED_ORDER_SQL}
            GROUP BY oi.product_id, p.name, p.sku, p.status
            ORDER BY "unitsSold" DESC, SUM(oi.quantity * oi.unit_price) DESC, p.name ASC, oi.product_id ASC
            LIMIT ${DASHBOARD_LIMITS.topProducts}`,
          // 4. Customer and product counts (current state + new customers per period).
          this.prisma.$queryRaw<CountsRow[]>`
            SELECT c."activeCustomers", c."archivedCustomers", c."newCustomers",
                   c."newCustomersPrevious", p."activeProducts", p."archivedProducts"
            FROM (
              SELECT COUNT(*) FILTER (WHERE is_active)::int AS "activeCustomers",
                     COUNT(*) FILTER (WHERE NOT is_active)::int AS "archivedCustomers",
                     COUNT(*) FILTER (
                       WHERE created_at >= ${start}::timestamptz AND created_at < ${end}::timestamptz
                     )::int AS "newCustomers",
                     COUNT(*) FILTER (
                       WHERE created_at >= ${previousStart}::timestamptz AND created_at < ${start}::timestamptz
                     )::int AS "newCustomersPrevious"
              FROM customers
              WHERE organization_id = ${org}
            ) c, (
              SELECT COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS "activeProducts",
                     COUNT(*) FILTER (WHERE status = 'ARCHIVED')::int AS "archivedProducts"
              FROM products
              WHERE organization_id = ${org}
            ) p`,
          // 5. Every warehouse with the stock of its active products (Phase 6 stock status rule).
          this.prisma.$queryRaw<WarehouseRow[]>`
            SELECT w.id, w.name, w.code, w.is_active AS "isActive",
                   COALESCE(SUM(i.quantity), 0)::bigint AS "totalUnits",
                   COUNT(i.id) FILTER (WHERE ${STOCK_STATUS_SQL.IN_STOCK})::int AS "inStockItems",
                   COUNT(i.id) FILTER (WHERE ${STOCK_STATUS_SQL.LOW_STOCK})::int AS "lowStockItems",
                   COUNT(i.id) FILTER (WHERE ${STOCK_STATUS_SQL.OUT_OF_STOCK})::int AS "outOfStockItems"
            FROM warehouses w
            LEFT JOIN (
              inventory i
              JOIN products p
                ON p.organization_id = i.organization_id AND p.id = i.product_id AND p.status = 'ACTIVE'
            ) ON i.organization_id = w.organization_id AND i.warehouse_id = w.id
            WHERE w.organization_id = ${org}
            GROUP BY w.id
            ORDER BY w.is_active DESC, w.code ASC, w.id ASC`,
          // 6. The newest orders of the same period (any status), for the Recent orders box.
          this.prisma.$queryRaw<RecentOrderRow[]>`
            SELECT o.id, o.order_number AS "orderNumber", o.status::text AS status,
                   o.total::text AS total, o.created_at AS "createdAt",
                   c.id AS "customerId", c.name AS "customerName", c.company_name AS "customerCompany"
            FROM orders o
            LEFT JOIN customers c ON c.organization_id = o.organization_id AND c.id = o.customer_id
            WHERE o.organization_id = ${org} AND ${inPeriod}
            ORDER BY o.created_at DESC, o.id DESC
            LIMIT ${DASHBOARD_LIMITS.recentOrders}`,
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );

    // Orders and revenue per period.
    const orders = { current: 0, previous: 0 };
    const realizedOrders = { current: 0, previous: 0 };
    const revenue = { current: new Decimal(0), previous: new Decimal(0) };
    const byStatus = new Map<OrderStatus, number>();
    for (const row of statusRows) {
      const key = row.isCurrent ? 'current' : 'previous';
      orders[key] += row.orders;
      if ((REALIZED_ORDER_STATUSES as readonly OrderStatus[]).includes(row.status)) {
        realizedOrders[key] += row.orders;
      }
      revenue[key] = revenue[key].plus(row.revenue);
      if (row.isCurrent) byStatus.set(row.status, row.orders);
    }

    const buckets = new Map(bucketRows.map((row) => [row.bucket, row]));
    const counts = countRows[0]!;
    const warehouses: DashboardWarehouseSummary[] = warehouseRows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      isActive: row.isActive,
      totalUnits: Number(row.totalUnits),
      inStockItems: row.inStockItems,
      lowStockItems: row.lowStockItems,
      outOfStockItems: row.outOfStockItems,
    }));
    // Organization-wide stock = the active warehouses (archived ones can't move stock).
    const activeWarehouses = warehouses.filter((warehouse) => warehouse.isActive);
    const sum = (pick: (warehouse: DashboardWarehouseSummary) => number) =>
      activeWarehouses.reduce((total, warehouse) => total + pick(warehouse), 0);

    return {
      period: current,
      comparisonPeriod: previous,
      generatedAt: now.toISOString(),
      kpis: {
        sales: moneyMetric(revenue.current, revenue.previous),
        orders: countMetric(orders.current, orders.previous),
        realizedOrders: countMetric(realizedOrders.current, realizedOrders.previous),
        newCustomers: countMetric(counts.newCustomers, counts.newCustomersPrevious),
        activeCustomers: counts.activeCustomers,
        archivedCustomers: counts.archivedCustomers,
        activeProducts: counts.activeProducts,
        archivedProducts: counts.archivedProducts,
        inventoryUnits: sum((warehouse) => warehouse.totalUnits),
        inStockItems: sum((warehouse) => warehouse.inStockItems),
        lowStockItems: sum((warehouse) => warehouse.lowStockItems),
        outOfStockItems: sum((warehouse) => warehouse.outOfStockItems),
        activeWarehouses: activeWarehouses.length,
        inactiveWarehouses: warehouses.length - activeWarehouses.length,
      },
      orderStatus: ORDER_STATUSES.map((status) => ({ status, count: byStatus.get(status) ?? 0 })),
      timeSeries: {
        bucket,
        points: dashboardBuckets(current.from, current.to, bucket).map((slot) => {
          const row = buckets.get(slot.key);
          return {
            period: slot.period,
            periodEnd: slot.periodEnd,
            orders: row?.orders ?? 0,
            realizedOrders: row?.realizedOrders ?? 0,
            revenue: money(new Decimal(row?.revenue ?? 0)),
          };
        }),
      },
      topProducts: topRows.map((row): DashboardTopProduct => ({
        productId: row.productId,
        name: row.name,
        sku: row.sku,
        status: row.status,
        unitsSold: Number(row.unitsSold),
        revenue: money(new Decimal(row.revenue)),
      })),
      warehouses,
      recentOrders: recentRows.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        status: row.status,
        customer: row.customerId
          ? { id: row.customerId, name: row.customerName!, companyName: row.customerCompany }
          : null,
        total: money(new Decimal(row.total)),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
