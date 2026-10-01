import type { DashboardOrderStatusCount, OrderStatus } from '@app/shared';
import { Link } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { percentOf } from '@/lib/chart-math';
import { cn } from '@/lib/cn';
import { formatCount, ordersInPeriodPath } from '@/lib/dashboard-params';
import { ORDER_STATUS_LABELS } from '@/lib/sales-params';

/** Bar fill per status: the same semantic tones as the order status badges. */
const BAR_TONES: Record<OrderStatus, string> = {
  DRAFT: 'bg-subtle-foreground',
  CONFIRMED: 'bg-primary',
  PROCESSING: 'bg-warning',
  SHIPPED: 'bg-primary',
  COMPLETED: 'bg-success',
  CANCELLED: 'bg-danger',
};

/**
 * Orders of the period per status as labelled horizontal bars: every status
 * is listed (zeros included), with its count and share written out, so small
 * categories stay readable and nothing depends on color.
 */
export function OrderStatusChart({
  organizationId,
  statuses,
  from,
  to,
}: {
  organizationId: string;
  statuses: DashboardOrderStatusCount[];
  from: string;
  to: string;
}) {
  const total = statuses.reduce((sum, entry) => sum + entry.count, 0);
  const largest = Math.max(1, ...statuses.map((entry) => entry.count));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Orders by status</CardTitle>
        <CardDescription>
          {total === 0
            ? 'No orders were created in this period.'
            : `${formatCount(total)} ${total === 1 ? 'order' : 'orders'} created in this period.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3" aria-label="Orders by status">
          {statuses.map(({ status, count }) => {
            const share = percentOf(count, total);
            return (
              <li key={status}>
                <Link
                  to={ordersInPeriodPath(organizationId, status, from, to)}
                  className="group flex flex-col gap-1.5 rounded-control focus-ring"
                  aria-label={`${ORDER_STATUS_LABELS[status]}: ${formatCount(count)} ${count === 1 ? 'order' : 'orders'}, ${share}%. View these orders`}
                >
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium text-foreground group-hover:underline">
                      {ORDER_STATUS_LABELS[status]}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      <span className="font-medium text-foreground">{formatCount(count)}</span>
                      {' · '}
                      {share}%
                    </span>
                  </span>
                  <span
                    className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
                    aria-hidden="true"
                  >
                    <span
                      className={cn('block h-full rounded-full', BAR_TONES[status])}
                      style={{
                        width: `${count === 0 ? 0 : Math.max(2, (count / largest) * 100)}%`,
                      }}
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
