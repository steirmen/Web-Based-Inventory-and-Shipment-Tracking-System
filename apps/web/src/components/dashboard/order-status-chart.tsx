import type { DashboardOrderStatusCount, OrderStatus } from '@app/shared';
import { Link } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { percentOf } from '@/lib/chart-math';
import { cn } from '@/lib/cn';
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { insights } from '@/i18n/messages/insights';
import { ordersInPeriodPath } from '@/lib/dashboard-params';

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
  period,
}: {
  organizationId: string;
  statuses: DashboardOrderStatusCount[];
  /** The dashboard period (days and time zone) the links filter by. */
  period: { from: string; to: string; timeZone: string };
}) {
  const total = statuses.reduce((sum, entry) => sum + entry.count, 0);
  const largest = Math.max(1, ...statuses.map((entry) => entry.count));
  const m = useMessages(insights).statusChart;
  const c = useMessages(common);
  const f = useFormat();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.title}</CardTitle>
        <CardDescription>
          {total === 0 ? m.none : m.created({ count: total, formatted: f.number(total) })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3" aria-label={m.title}>
          {statuses.map(({ status, count }) => {
            const share = percentOf(count, total);
            return (
              <li key={status}>
                <Link
                  to={ordersInPeriodPath(organizationId, status, period)}
                  className="group flex flex-col gap-1.5 rounded-control focus-ring"
                  aria-label={m.link({
                    status: c.orderStatus[status],
                    count,
                    formatted: f.number(count),
                    share: f.number(share),
                  })}
                >
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium text-foreground group-hover:underline">
                      {c.orderStatus[status]}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      <span className="font-medium text-foreground">{f.number(count)}</span>
                      {' · '}
                      {f.percent(share)}
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
