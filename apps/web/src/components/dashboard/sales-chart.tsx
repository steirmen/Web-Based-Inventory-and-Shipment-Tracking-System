import type { Currency, DashboardTimeSeries } from '@app/shared';
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
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { insights } from '@/i18n/messages/insights';
import { formatBucketLabel, formatDayRange } from '@/lib/dashboard-params';
import { paths } from '@/routes/paths';
import { BarChart, type BarDatum } from './bar-chart';

type Metric = 'revenue' | 'orders';

/**
 * Sales over time: realized revenue or the number of orders per bucket of the
 * selected period, with a data table for exact values.
 */
export function SalesChart({
  organizationId,
  series,
  totalRevenue,
  totalOrders,
  currency,
}: {
  organizationId: string;
  series: DashboardTimeSeries;
  totalRevenue: string;
  totalOrders: number;
  /** Currency of the revenue figures. */
  currency: Currency;
}) {
  const m = useMessages(insights).salesChart;
  const f = useFormat();
  const [metric, setMetric] = useState<Metric>('revenue');
  const [showTable, setShowTable] = useState(false);
  const bucket = m.buckets[series.bucket];
  const empty = totalOrders === 0;
  /** Axis label of a whole number of cents, without float parsing of amounts. */
  const formatCentsTick = (cents: number) =>
    f.compactMoney(centsToDecimal(BigInt(cents)), currency);
  const orderCount = (count: number) => m.orderCount({ count, formatted: f.number(count) });

  const data: BarDatum[] = series.points.map((point) => {
    const range =
      point.period === point.periodEnd
        ? formatDayRange(point.period, point.period, f.locale)
        : formatDayRange(point.period, point.periodEnd, f.locale);
    return {
      key: point.period,
      label: formatBucketLabel(point.period, series.bucket, f.locale),
      title: range,
      value: metric === 'revenue' ? Number(toCents(point.revenue)) : point.orders,
      details: [
        m.revenueLine({ amount: f.money(point.revenue, currency) }),
        m.ordersLine({
          orders: orderCount(point.orders),
          realized: f.number(point.realizedOrders),
        }),
      ],
    };
  });

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <CardTitle>{m.title}</CardTitle>
          <CardDescription>
            {metric === 'revenue'
              ? m.revenueDescription({ bucket, total: f.money(totalRevenue, currency) })
              : m.ordersDescription({ bucket, total: orderCount(totalOrders) })}
          </CardDescription>
        </div>
        {!empty && (
          <SegmentedControl
            label={m.chartShows}
            value={metric}
            options={[
              { value: 'revenue', label: m.revenue },
              { value: 'orders', label: m.orders },
            ]}
            onChange={setMetric}
          />
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {empty ? (
          <EmptyState
            icon={<LineChart className="size-5" aria-hidden="true" />}
            title={m.empty}
            description={m.emptyText}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link
                  to={paths.orders(organizationId)}
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  {m.viewOrders}
                </Link>
                <Can permission="ORDERS_CREATE">
                  <Link
                    to={paths.orderNew(organizationId)}
                    className={buttonVariants({ size: 'sm' })}
                  >
                    <Plus aria-hidden="true" />
                    {m.createOrder}
                  </Link>
                </Can>
              </div>
            }
          />
        ) : (
          <>
            <BarChart
              data={data}
              label={metric === 'revenue' ? m.revenueChart({ bucket }) : m.ordersChart({ bucket })}
              formatTick={metric === 'revenue' ? formatCentsTick : f.number}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm bg-primary" aria-hidden="true" />
                {metric === 'revenue' ? m.revenueLegend : m.ordersLegend}
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={showTable}
                onClick={() => setShowTable((shown) => !shown)}
              >
                {showTable ? m.hideTable : m.showTable}
              </Button>
            </div>
            {showTable && (
              <div className="overflow-x-auto rounded-control border border-border">
                <table className="w-full text-sm">
                  <caption className="sr-only">{m.tableCaption({ bucket })}</caption>
                  <thead className="bg-surface-muted text-left text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">
                        {m.period}
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        {m.orders}
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        {m.realized}
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">
                        {m.revenue}
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
                          {f.number(point.orders)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {f.number(point.realizedOrders)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {f.money(point.revenue, currency)}
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
