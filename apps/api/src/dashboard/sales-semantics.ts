import { REALIZED_ORDER_STATUSES } from '@app/shared';
import { Prisma } from '../generated/prisma/client.js';

/**
 * Business definitions shared by the dashboard and the reports, so both
 * always agree (docs/dashboard-reporting.md).
 */

/**
 * Order `o` is a realized sale: its stock has been deducted (PROCESSING,
 * SHIPPED, COMPLETED). DRAFT, CONFIRMED, and CANCELLED orders never count.
 */
export const REALIZED_ORDER_SQL = Prisma.sql`o.status IN (${Prisma.join(
  REALIZED_ORDER_STATUSES.map((status) => Prisma.sql`${status}::order_status`),
)})`;
