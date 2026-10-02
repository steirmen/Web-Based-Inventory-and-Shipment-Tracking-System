import type { Currency, DashboardRecentOrder, DashboardTopProduct } from '@app/shared';
import { ArrowRight, Package, ReceiptText } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/layout/page-state';
import { Can } from '@/components/organization/can';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { insights } from '@/i18n/messages/insights';

import { paths } from '@/routes/paths';

/** Best sellers of the period by units sold in realized orders. */
export function TopProducts({
  organizationId,
  products,
  salesReportHref,
  currency,
}: {
  organizationId: string;
  products: DashboardTopProduct[];
  /** The sales report for the same period. */
  salesReportHref: string;
  /** Currency of the revenue figures. */
  currency: Currency;
}) {
  const m = useMessages(insights).topProducts;
  const f = useFormat();
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <CardTitle>{m.title}</CardTitle>
          <CardDescription>{m.description}</CardDescription>
        </div>
        <Link
          to={salesReportHref}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'self-start')}
        >
          {m.salesReport}
          <ArrowRight aria-hidden="true" />
        </Link>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <EmptyState
            icon={<Package className="size-5" aria-hidden="true" />}
            title={m.empty}
            description={m.emptyText}
          />
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[20rem] text-sm">
              <caption className="sr-only">{m.caption}</caption>
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {m.product}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {m.unitsSold}
                  </th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">
                    {m.revenue}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.map((product) => (
                  <tr key={product.productId}>
                    <th scope="row" className="py-2 pr-3 text-left font-normal">
                      <Link
                        to={paths.product(organizationId, product.productId)}
                        className="rounded-sm font-medium text-foreground focus-ring hover:underline"
                      >
                        {product.name}
                      </Link>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{product.sku}</span>
                        {product.status === 'ARCHIVED' && (
                          <Badge tone="neutral">{m.archived}</Badge>
                        )}
                      </span>
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {f.number(product.unitsSold)}
                    </td>
                    <td className="py-2 pl-3 text-right tabular-nums">
                      {f.money(product.revenue, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The newest orders of the dashboard's period (any status), delivered with the
 * summary, so they always follow the selected range and time zone.
 */
export function RecentOrders({
  organizationId,
  orders: items,
  allOrdersHref,
}: {
  organizationId: string;
  orders: DashboardRecentOrder[];
  /** The orders list filtered to the same days. */
  allOrdersHref: string;
}) {
  const m = useMessages(insights).recentOrders;
  const f = useFormat();
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <CardTitle>{m.title}</CardTitle>
          <CardDescription>{m.description}</CardDescription>
        </div>
        <Link
          to={allOrdersHref}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'self-start')}
        >
          {m.inPeriod}
          <ArrowRight aria-hidden="true" />
        </Link>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            icon={<ReceiptText className="size-5" aria-hidden="true" />}
            title={m.empty}
            action={
              <Can permission="ORDERS_CREATE">
                <Link
                  to={paths.orderNew(organizationId)}
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  {m.createOrder}
                </Link>
              </Can>
            }
          />
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[20rem] text-sm">
              <caption className="sr-only">{m.caption}</caption>
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {m.order}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {m.status}
                  </th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">
                    {m.total}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((order) => (
                  <tr key={order.id}>
                    <th scope="row" className="py-2 pr-3 text-left font-normal">
                      <Link
                        to={paths.order(organizationId, order.id)}
                        className="rounded-sm font-medium text-foreground focus-ring hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">
                        {order.customer?.name ?? m.noCustomer} · {f.date(order.createdAt)}
                      </span>
                    </th>
                    <td className="px-3 py-2">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="py-2 pl-3 text-right tabular-nums">
                      {f.money(order.total, order.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
