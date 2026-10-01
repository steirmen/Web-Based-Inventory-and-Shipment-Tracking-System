import type { Order } from '@app/shared';
import { ArrowLeft, History } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/layout/page-state';
import { OrderActions } from '@/components/orders/order-actions';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useOrder } from '@/hooks/use-sales';
import { hasErrorCode } from '@/lib/api-errors';
import { pageTitle } from '@/lib/app-config';
import { useFlashNotice } from '@/lib/flash-notice';
import { formatDateTime } from '@/lib/format';
import { movementsPath } from '@/lib/inventory-params';
import { formatMoney } from '@/lib/money';
import { useCurrentOrganization } from '@/lib/organization-context';
import { paths } from '@/routes/paths';

const HISTORY_LABELS: Record<string, string> = {
  ORDER_CREATED: 'Created',
  ORDER_UPDATED: 'Draft edited',
  ORDER_CONFIRMED: 'Confirmed',
  ORDER_PROCESSING: 'Processed — stock deducted',
  ORDER_SHIPPED: 'Shipped',
  ORDER_COMPLETED: 'Completed',
  ORDER_CANCELLED: 'Cancelled',
};

/** Stock is shown only while the order hasn't taken it yet. */
const showsStock = (order: Order) => order.status === 'DRAFT' || order.status === 'CONFIRMED';
const tookStock = (order: Order) =>
  order.status === 'PROCESSING' || order.status === 'SHIPPED' || order.status === 'COMPLETED';

function BackToOrders() {
  const { organization } = useCurrentOrganization();
  return (
    <Link
      to={paths.orders(organization.id)}
      className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'self-start' })}
    >
      <ArrowLeft aria-hidden="true" />
      All orders
    </Link>
  );
}

/**
 * One order: lines render from their snapshots (name, SKU, price at the time
 * they were added), with the lifecycle actions the status and role allow.
 */
export function OrderDetailPage() {
  const { organization } = useCurrentOrganization();
  const { orderId = '' } = useParams();
  const query = useOrder(organization.id, orderId);
  const [notice, setNotice] = useFlashNotice();

  if (query.isPending) return <LoadingState label="Loading order" />;
  if (query.isError) {
    if (hasErrorCode(query.error, 'ORDER_NOT_FOUND')) {
      return (
        <div className="flex flex-col gap-6">
          <title>{pageTitle('Order not found')}</title>
          <BackToOrders />
          <PageHeader title="Order not found" />
          <EmptyState
            title="This order doesn't exist in this workspace."
            description="It may belong to another workspace, or the link is wrong."
          />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-6">
        <BackToOrders />
        <ErrorState
          title="We couldn't load this order"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const order = query.data.order;
  const stock = showsStock(order);

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`${order.orderNumber} · ${organization.name}`)}</title>
      <BackToOrders />
      <PageHeader
        eyebrow="Order"
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {order.orderNumber}
            <OrderStatusBadge status={order.status} />
          </span>
        }
        description={order.customer ? order.customer.name : 'No customer'}
        actions={
          <OrderActions
            order={order}
            onDone={(message) => {
              setNotice(message);
            }}
          />
        }
      />

      {notice && <Alert tone="success">{notice}</Alert>}
      {order.status === 'DRAFT' && order.items.length === 0 && (
        <Alert tone="info">Add at least one product before confirming this order.</Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Lines</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {order.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No products on this order yet.</p>
            ) : (
              <>
                <table className="hidden w-full text-sm md:table">
                  <thead className="border-b border-border text-left text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Product
                      </th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">
                        Quantity
                      </th>
                      {stock && (
                        <th scope="col" className="py-2 pr-3 text-right font-medium">
                          In stock
                        </th>
                      )}
                      <th scope="col" className="py-2 pr-3 text-right font-medium">
                        Unit price
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        Line total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {order.items.map((item) => (
                      <tr key={item.id}>
                        <td className="max-w-64 py-2.5 pr-3">
                          <span className="block truncate font-medium">{item.productName}</span>
                          <span className="inline-flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">
                              {item.sku}
                            </span>
                            {item.productStatus !== 'ACTIVE' && <Badge>Product archived</Badge>}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{item.quantity}</td>
                        {stock && (
                          <td className="py-2.5 pr-3 text-right tabular-nums">
                            <StockCell available={item.availableQuantity} needed={item.quantity} />
                          </td>
                        )}
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {formatMoney(item.unitPrice)}
                        </td>
                        <td className="py-2.5 text-right font-medium tabular-nums">
                          {formatMoney(item.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ul className="divide-y divide-border md:hidden" aria-label="Order lines">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex flex-col gap-2 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.productName}</p>
                        <p className="font-mono text-xs text-muted-foreground">{item.sku}</p>
                        {item.productStatus !== 'ACTIVE' && (
                          <Badge className="mt-1">Product archived</Badge>
                        )}
                      </div>
                      <dl className="grid grid-cols-3 gap-2 text-sm">
                        <Field label="Quantity">{item.quantity}</Field>
                        <Field label="Unit price">{formatMoney(item.unitPrice)}</Field>
                        <Field label="Line total">{formatMoney(item.lineTotal)}</Field>
                        {stock && (
                          <Field label="In stock">
                            <StockCell available={item.availableQuantity} needed={item.quantity} />
                          </Field>
                        )}
                      </dl>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <dl className="ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 border-t border-border pt-3 text-sm">
              <dt className="text-muted-foreground">Items</dt>
              <dd className="text-right tabular-nums">
                {order.itemCount} {order.itemCount === 1 ? 'line' : 'lines'}, {order.totalQuantity}{' '}
                units
              </dd>
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="text-right tabular-nums">{formatMoney(order.subtotal)}</dd>
              <dt className="font-medium">Total</dt>
              <dd className="text-right text-base font-semibold tabular-nums">
                {formatMoney(order.total)}
              </dd>
            </dl>
            <p className="text-xs text-subtle-foreground">
              Prices are fixed when a product is added to the order. No taxes, discounts, or
              shipping are applied.
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-3 text-sm">
                <Field label="Customer">
                  {order.customer ? (
                    <Link
                      to={paths.customer(organization.id, order.customer.id)}
                      className="rounded-sm font-medium focus-ring hover:underline"
                    >
                      {order.customer.name}
                      {order.customer.companyName ? ` — ${order.customer.companyName}` : ''}
                    </Link>
                  ) : (
                    'No customer'
                  )}
                  {order.customer && !order.customer.isActive && (
                    <Badge className="ml-2">Archived</Badge>
                  )}
                </Field>
                <Field label="Warehouse">
                  <Link
                    to={paths.warehouse(organization.id, order.warehouse.id)}
                    className="rounded-sm font-medium focus-ring hover:underline"
                  >
                    {order.warehouse.name} ({order.warehouse.code})
                  </Link>
                  {!order.warehouse.isActive && <Badge className="ml-2">Archived</Badge>}
                </Field>
                <Field label="Created">{formatDateTime(order.createdAt)}</Field>
                <Field label="Last updated">{formatDateTime(order.updatedAt)}</Field>
                {order.notes && (
                  <Field label="Notes">
                    <span className="whitespace-pre-line">{order.notes}</span>
                  </Field>
                )}
              </dl>
              {tookStock(order) && (
                <Link
                  to={movementsPath(organization.id, { warehouseId: order.warehouse.id })}
                  className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'mt-4' })}
                >
                  <History aria-hidden="true" />
                  Stock movements in {order.warehouse.code}
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent>
              {order.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recorded events.</p>
              ) : (
                <ol className="flex flex-col gap-3 text-sm">
                  {order.history.map((entry, index) => (
                    <li key={`${entry.action}-${index}`} className="flex flex-col">
                      <span className="font-medium">
                        {HISTORY_LABELS[entry.action] ?? entry.action}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(entry.createdAt)} · {entry.actor?.name ?? 'System'}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

function StockCell({ available, needed }: { available: number | null; needed: number }) {
  if (available === null) return <>—</>;
  return (
    <>
      {available.toLocaleString()}
      {available < needed && <span className="block text-xs text-danger">Not enough</span>}
    </>
  );
}
