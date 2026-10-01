import type { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Read-only integrity audit of the business data (Phase 10B). Each check is
 * one SQL query that returns the offending rows' ids; an empty result means
 * the invariant holds. All queries run in ONE read-only transaction, so the
 * audit sees a consistent snapshot and can never change data.
 *
 * Used by `npm run db:verify` (any database, e.g. development) and by the
 * database and browser test suites (their own test databases).
 */

export interface IntegrityCheck {
  name: string;
  description: string;
  /** Ids (or keys) of the rows that break the invariant; empty = OK. */
  violations: string[];
}

interface Row {
  key: string;
}

const CHECKS: { name: string; description: string; sql: string }[] = [
  {
    name: 'movement-arithmetic',
    description: 'every stock movement: quantity_before + quantity_delta = quantity_after',
    sql: `SELECT id::text AS key FROM stock_movements
          WHERE quantity_before + quantity_delta <> quantity_after`,
  },
  {
    name: 'movement-chain',
    description:
      "each movement's quantity_before equals the previous quantity_after (0 for the first)",
    sql: `SELECT id::text AS key FROM (
            SELECT id, quantity_before,
                   lag(quantity_after) OVER (PARTITION BY warehouse_id, product_id
                                             ORDER BY created_at, id) AS previous
            FROM stock_movements) m
          WHERE quantity_before <> COALESCE(previous, 0)`,
  },
  {
    name: 'inventory-matches-ledger',
    description: 'every inventory quantity equals the last movement (0 without movements)',
    sql: `SELECT i.id::text AS key FROM inventory i
          WHERE i.quantity <> COALESCE((
            SELECT s.quantity_after FROM stock_movements s
            WHERE s.warehouse_id = i.warehouse_id AND s.product_id = i.product_id
            ORDER BY s.created_at DESC, s.id DESC LIMIT 1), 0)`,
  },
  {
    name: 'ledger-has-inventory',
    description: 'every (warehouse, product) with movements has an inventory row',
    sql: `SELECT DISTINCT s.warehouse_id::text || '/' || s.product_id::text AS key
          FROM stock_movements s
          LEFT JOIN inventory i ON i.warehouse_id = s.warehouse_id AND i.product_id = s.product_id
          WHERE i.id IS NULL`,
  },
  {
    name: 'non-negative-stock',
    description: 'no inventory quantity and no quantity_after is negative',
    sql: `SELECT id::text AS key FROM inventory WHERE quantity < 0
          UNION ALL SELECT id::text FROM stock_movements WHERE quantity_after < 0`,
  },
  {
    name: 'transfers-balanced',
    description:
      'every transfer is exactly TRANSFER_OUT + TRANSFER_IN of the same product, summing to 0',
    sql: `SELECT transfer_group_id::text AS key FROM stock_movements
          WHERE transfer_group_id IS NOT NULL
          GROUP BY transfer_group_id
          HAVING count(*) <> 2 OR sum(quantity_delta) <> 0 OR count(DISTINCT product_id) <> 1
              OR count(DISTINCT organization_id) <> 1
              OR bool_and(movement_type IN ('TRANSFER_OUT', 'TRANSFER_IN')) IS NOT TRUE
              OR count(DISTINCT movement_type) <> 2`,
  },
  {
    name: 'order-totals',
    description: 'every line total = unit price × quantity; order subtotal = total = Σ line totals',
    sql: `SELECT o.id::text AS key FROM orders o
          LEFT JOIN order_items i ON i.order_id = o.id
          GROUP BY o.id, o.subtotal, o.total
          HAVING o.subtotal <> COALESCE(sum(i.line_total), 0) OR o.total <> o.subtotal
              OR bool_or(i.line_total <> i.unit_price * i.quantity) IS TRUE`,
  },
  {
    name: 'fulfilled-orders-have-sales',
    description:
      'processed/shipped/completed orders have exactly one SALE movement per line, matching product and quantity',
    sql: `SELECT o.id::text AS key FROM orders o
          WHERE o.status IN ('PROCESSING', 'SHIPPED', 'COMPLETED')
            AND (
              (SELECT count(*) FROM order_items i WHERE i.order_id = o.id) <>
              (SELECT count(*) FROM stock_movements s
               WHERE s.reference_type = 'ORDER' AND s.reference_id = o.id AND s.movement_type = 'SALE')
              OR EXISTS (
                SELECT 1 FROM order_items i
                WHERE i.order_id = o.id AND NOT EXISTS (
                  SELECT 1 FROM stock_movements s
                  WHERE s.reference_type = 'ORDER' AND s.reference_id = o.id
                    AND s.movement_type = 'SALE' AND s.product_id = i.product_id
                    AND s.warehouse_id = o.warehouse_id AND s.quantity_delta = -i.quantity)))`,
  },
  {
    name: 'unfulfilled-orders-have-no-sales',
    description: 'draft, confirmed, and cancelled orders have no SALE movements',
    sql: `SELECT DISTINCT o.id::text AS key FROM orders o
          JOIN stock_movements s ON s.reference_type = 'ORDER' AND s.reference_id = o.id
          WHERE o.status IN ('DRAFT', 'CONFIRMED', 'CANCELLED')`,
  },
  {
    name: 'order-references-exist',
    description: 'every ORDER-referenced movement points at an order of the same organization',
    sql: `SELECT s.id::text AS key FROM stock_movements s
          LEFT JOIN orders o ON o.id = s.reference_id AND o.organization_id = s.organization_id
          WHERE s.reference_type = 'ORDER' AND o.id IS NULL`,
  },
  {
    name: 'tenant-relations',
    description: 'order lines, inventory, and movements stay inside one organization',
    sql: `SELECT i.id::text AS key FROM order_items i
            JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id
          WHERE i.organization_id <> o.organization_id OR p.organization_id <> o.organization_id
          UNION ALL
          SELECT v.id::text FROM inventory v
            JOIN warehouses w ON w.id = v.warehouse_id JOIN products p ON p.id = v.product_id
          WHERE w.organization_id <> v.organization_id OR p.organization_id <> v.organization_id
          UNION ALL
          SELECT s.id::text FROM stock_movements s
            JOIN warehouses w ON w.id = s.warehouse_id JOIN products p ON p.id = s.product_id
          WHERE w.organization_id <> s.organization_id OR p.organization_id <> s.organization_id
          UNION ALL
          SELECT o.id::text FROM orders o
            JOIN warehouses w ON w.id = o.warehouse_id
            LEFT JOIN customers c ON c.id = o.customer_id
          WHERE w.organization_id <> o.organization_id OR c.organization_id <> o.organization_id`,
  },
  {
    name: 'unique-order-numbers',
    description: 'order numbers are unique per organization and below the next sequence value',
    sql: `SELECT organization_id::text || '/' || order_number AS key FROM orders
          GROUP BY organization_id, order_number HAVING count(*) > 1
          UNION ALL
          SELECT o.organization_id::text FROM orders o
            LEFT JOIN order_number_sequences q ON q.organization_id = o.organization_id
          WHERE o.order_number ~ '^SO-[0-9]+$'
          GROUP BY o.organization_id, q.last_number
          HAVING max(substring(o.order_number FROM 4)::int) > COALESCE(q.last_number, 0)`,
  },
  {
    name: 'one-owner',
    description: 'every organization has exactly one OWNER',
    sql: `SELECT g.id::text AS key FROM organizations g
          LEFT JOIN organization_members m ON m.organization_id = g.id AND m.role = 'OWNER'
          GROUP BY g.id HAVING count(m.id) <> 1`,
  },
];

/** Runs every check in one read-only snapshot. Never writes. */
export async function verifyIntegrity(prisma: PrismaClient): Promise<IntegrityCheck[]> {
  const results = await prisma.$transaction([
    prisma.$executeRawUnsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'),
    ...CHECKS.map((check) => prisma.$queryRawUnsafe<Row[]>(check.sql)),
  ]);
  return CHECKS.map((check, index) => ({
    name: check.name,
    description: check.description,
    violations: (results[index + 1] as Row[]).map((row) => row.key),
  }));
}
