import type { DashboardRecentOrder, DashboardTopProduct } from '@app/shared';
import { ArrowRight, Package, ReceiptText } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/layout/page-state';
import { Can } from '@/components/organization/can';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/dashboard-params';
import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { paths } from '@/routes/paths';

/** Best sellers of the period by units sold in realized orders. */
export function TopProducts({
  organizationId,
  products,
  salesReportHref,
}: {
  organizationId: string;
  products: DashboardTopProduct[];
  /** The sales report for the same period. */
  salesReportHref: string;
}) {
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Top products</CardTitle>
          <CardDescription>By units sold in realized orders of this period.</CardDescription>
        </div>
        <Link
          to={salesReportHref}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'self-start')}
        >
          Sales report
          <ArrowRight aria-hidden="true" />
        </Link>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <EmptyState
            icon={<Package className="size-5" aria-hidden="true" />}
            title="No products sold in this period."
            description="Products appear here once orders containing them are processed."
          />
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[20rem] text-sm">
              <caption className="sr-only">Top products by units sold</caption>
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Product
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Units sold
                  </th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">
                    Revenue
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
                        {product.status === 'ARCHIVED' && <Badge tone="neutral">Archived</Badge>}
                      </span>
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCount(product.unitsSold)}
                    </td>
                    <td className="py-2 pl-3 text-right tabular-nums">
                      {formatMoney(product.revenue)}
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

/** The five newest orders (any status, any date), from the regular orders list. */
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
  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Recent orders</CardTitle>
          <CardDescription>The newest orders created in this period.</CardDescription>
        </div>
        <Link
          to={allOrdersHref}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'self-start')}
        >
          Orders in this period
          <ArrowRight aria-hidden="true" />
        </Link>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            icon={<ReceiptText className="size-5" aria-hidden="true" />}
            title="No orders in this period."
            action={
              <Can permission="ORDERS_CREATE">
                <Link
                  to={paths.orderNew(organizationId)}
                  className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                >
                  Create order
                </Link>
              </Can>
            }
          />
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[20rem] text-sm">
              <caption className="sr-only">Five newest orders</caption>
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Order
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">
                    Total
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
                        {order.customer?.name ?? 'No customer'} · {formatDate(order.createdAt)}
                      </span>
                    </th>
                    <td className="px-3 py-2">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="py-2 pl-3 text-right tabular-nums">
                      {formatMoney(order.total)}
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
