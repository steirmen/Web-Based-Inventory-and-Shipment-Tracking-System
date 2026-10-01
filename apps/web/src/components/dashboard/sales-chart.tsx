import type { DashboardBucket, DashboardTimeSeries } from '@app/shared';
import { LineChart, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/layout/page-state';
import { Can } from '@/components/organization/can';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { centsToDecimal, toCents } from '@/lib/chart-math';
import { formatBucketLabel, formatCount, formatDayRange } from '@/lib/dashboard-params';
import { formatMoney } from '@/lib/money';
import { paths } from '@/routes/paths';
import { BarChart, type BarDatum } from './bar-chart';

type Metric = 'revenue' | 'orders';

const BUCKET_NAMES: Record<DashboardBucket, string> = { DAY: 'day', WEEK: 'week', MONTH: 'month' };

const compactMoney = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});
/** Axis label of a whole number of cents, without float parsing of amounts. */
const formatCentsTick = (cents: number) =>
  compactMoney.format(centsToDecimal(BigInt(cents)) as Intl.StringNumericLiteral);

const plural = (count: number, word: string) =>
  `${formatCount(count)} ${word}${count === 1 ? '' : 's'}`;

/**
 * Sales over time: realized revenue or the number of orders per bucket of the
 * selected period, with a data table for exact values.
 */
export function SalesChart({
  organizationId,
  series,
  totalRevenue,
  totalOrders,
}: {
  organizationId: string;
  series: DashboardTimeSeries;
  totalRevenue: string;
  totalOrders: number;
}) {
  const [metric, setMetric] = useState<Metric>('revenue');
  const [showTable, setShowTable] = useState(false);
  const bucket = BUCKET_NAMES[series.bucket];
  const empty = totalOrders === 0;

  const data: BarDatum[] = series.points.map((point) => {
    const range =
      point.period === point.periodEnd
        ? formatDayRange(point.period, point.period)
        : formatDayRange(point.period, point.periodEnd);
    return {
      key: point.period,
      label: formatBucketLabel(point.period, series.bucket),
      title: range,
      value: metric === 'revenue' ? Number(toCents(point.revenue)) : point.orders,
      details: [
        `Revenue ${formatMoney(point.revenue)}`,
        `${plural(point.orders, 'order')} (${formatCount(point.realizedOrders)} realized)`,
      ],
    };
  });

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Sales over time</CardTitle>
          <CardDescription>
            {metric === 'revenue'
              ? `Realized revenue per ${bucket}: ${formatMoney(totalRevenue)} in total.`
              : `Orders created per ${bucket}, every status: ${plural(totalOrders, 'order')} in total.`}
          </CardDescription>
        </div>
        {!empty && (
          <SegmentedControl
            label="Chart shows"
            value={metric}
            options={[
              { value: 'revenue', label: 'Revenue' },
              { value: 'orders', label: 'Orders' },
            ]}
            onChange={setMetric}
          />
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {empty ? (
          <EmptyState
            icon={<LineChart className="size-5" aria-hidden="true" />}
            title="No sales data for this period."
            description="Orders created in this period appear here, and revenue once their stock has been deducted."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link
                  to={paths.orders(organizationId)}
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  View orders
                </Link>
                <Can permission="ORDERS_CREATE">
                  <Link
                    to={paths.orderNew(organizationId)}
                    className={buttonVariants({ size: 'sm' })}
                  >
                    <Plus aria-hidden="true" />
                    Create order
                  </Link>
                </Can>
              </div>
            }
          />
        ) : (
          <>
            <BarChart
              data={data}
              label={
                metric === 'revenue'
                  ? `Realized revenue per ${bucket}, bar chart`
                  : `Orders per ${bucket}, bar chart`
              }
              formatTick={metric === 'revenue' ? formatCentsTick : formatCount}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm bg-primary" aria-hidden="true" />
                {metric === 'revenue'
                  ? 'Realized revenue (processing, shipped, completed orders)'
                  : 'Orders (every status)'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={showTable}
                onClick={() => setShowTable((shown) => !shown)}
              >
                {showTable ? 'Hide data table' : 'Show data table'}
              </Button>
            </div>
            {showTable && (
              <div className="overflow-x-auto rounded-control border border-border">
                <table className="w-full text-sm">
                  <caption className="sr-only">Sales per {bucket}</caption>
                  <thead className="bg-surface-muted text-left text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Period
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        Orders
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        Realized
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        Revenue
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {series.points.map((point, index) => (
                      <tr key={point.period}>
                        <th scope="row" className="px-3 py-1.5 text-left font-normal">
                          {data[index]!.title}
                        </th>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {formatCount(point.orders)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {formatCount(point.realizedOrders)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {formatMoney(point.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
