import type { Order } from '@app/shared';
import { History } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { BackLink } from '@/components/layout/back-link';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, DetailSkeleton } from '@/components/layout/page-state';
import { OrderActions } from '@/components/orders/order-actions';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useOrder } from '@/hooks/use-sales';
import { hasErrorCode } from '@/lib/api-errors';
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { sales } from '@/i18n/messages/sales';
import { pageTitle } from '@/lib/app-config';
import { useFlashNotice } from '@/lib/flash-notice';
import { movementsPath } from '@/lib/inventory-params';
import { useCurrentOrganization } from '@/lib/organization-context';
import { paths } from '@/routes/paths';

/** Stock is shown only while the order hasn't taken it yet. */
const showsStock = (order: Order) => order.status === 'DRAFT' || order.status === 'CONFIRMED';
const tookStock = (order: Order) =>
  order.status === 'PROCESSING' || order.status === 'SHIPPED' || order.status === 'COMPLETED';

function BackToOrders() {
  const { organization } = useCurrentOrganization();
  const m = useMessages(sales).order;
  return <BackLink to={paths.orders(organization.id)} label={m.back} />;
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
  const m = useMessages(sales).order;
  const c = useMessages(common);
  const f = useFormat();

  if (query.isPending) return <DetailSkeleton label={m.loading} />;
  if (query.isError) {
    if (hasErrorCode(query.error, 'ORDER_NOT_FOUND')) {
      return (
        <div className="flex flex-col gap-6">
          <title>{pageTitle(m.notFoundTitle)}</title>
          <BackToOrders />
          <PageHeader title={m.notFoundTitle} />
          <EmptyState title={m.notFoundText} description={m.notFoundHint} />
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-6">
        <BackToOrders />
        <ErrorState title={m.loadError} error={query.error} onRetry={() => void query.refetch()} />
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
        eyebrow={m.eyebrow}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {order.orderNumber}
            <OrderStatusBadge status={order.status} />
          </span>
        }
        description={order.customer ? order.customer.name : m.noCustomer}
        actions={
          <OrderActions
            order={order}
            onDone={(message) => {
              setNotice(message);
            }}
          />
        }
      />

      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {order.status === 'DRAFT' && order.items.length === 0 && (
        <Alert tone="info">{m.addProductFirst}</Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{m.lines}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {order.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">{m.noLines}</p>
            ) : (
              <>
                <Table className="hidden @2xl:table">
                  <TableHeader className="bg-transparent">
                    <tr>
                      <TableHead className="px-0 py-2 pr-3 @5xl:px-0">{m.product}</TableHead>
                      <TableHead align="right" className="px-0 py-2 pr-3 @5xl:px-0">
                        {m.quantity}
                      </TableHead>
                      {stock && (
                        <TableHead align="right" className="px-0 py-2 pr-3 @5xl:px-0">
                          {m.inStock}
                        </TableHead>
                      )}
                      <TableHead align="right" className="px-0 py-2 pr-3 @5xl:px-0">
                        {m.unitPrice}
                      </TableHead>
                      <TableHead align="right" className="px-0 py-2 @5xl:px-0">
                        {m.lineTotal}
                      </TableHead>
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {order.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="max-w-64 px-0 py-2.5 pr-3">
                          <span className="block truncate font-medium">{item.productName}</span>
                          <span className="inline-flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">
                              {item.sku}
                            </span>
                            {item.productStatus !== 'ACTIVE' && <Badge>{m.productArchived}</Badge>}
                          </span>
                        </TableCell>
                        <TableCell align="right" className="px-0 py-2.5 pr-3 @5xl:px-0">
                          {f.number(item.quantity)}
                        </TableCell>
                        {stock && (
                          <TableCell align="right" className="px-0 py-2.5 pr-3 @5xl:px-0">
                            <StockCell available={item.availableQuantity} needed={item.quantity} />
                          </TableCell>
                        )}
                        <TableCell align="right" className="px-0 py-2.5 pr-3 @5xl:px-0">
                          {f.money(item.unitPrice, item.currency)}
                        </TableCell>
                        <TableCell align="right" className="px-0 py-2.5 font-medium @5xl:px-0">
                          {f.money(item.lineTotal, item.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <ul className="divide-y divide-border @2xl:hidden" aria-label={m.orderLines}>
                  {order.items.map((item) => (
                    <li key={item.id} className="flex flex-col gap-2 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.productName}</p>
                        <p className="font-mono text-xs text-muted-foreground">{item.sku}</p>
                        {item.productStatus !== 'ACTIVE' && (
                          <Badge className="mt-1">{m.productArchived}</Badge>
                        )}
                      </div>
                      <dl className="grid grid-cols-3 gap-2 text-sm">
                        <Field label={m.quantity}>{f.number(item.quantity)}</Field>
                        <Field label={m.unitPrice}>{f.money(item.unitPrice, item.currency)}</Field>
                        <Field label={m.lineTotal}>{f.money(item.lineTotal, item.currency)}</Field>
                        {stock && (
                          <Field label={m.inStock}>
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
              <dt className="text-muted-foreground">{m.items}</dt>
              <dd className="text-right tabular-nums">
                {m.itemsSummary({ lines: order.itemCount, units: f.number(order.totalQuantity) })}
              </dd>
              <dt className="text-muted-foreground">{m.subtotal}</dt>
              <dd className="text-right tabular-nums">{f.money(order.subtotal, order.currency)}</dd>
              <dt className="font-medium">{m.total}</dt>
              <dd className="text-right text-base font-semibold tabular-nums">
                {f.money(order.total, order.currency)}
              </dd>
              {order.currency && (
                <>
                  <dt className="text-muted-foreground">{m.currency}</dt>
                  <dd className="text-right">
                    {order.currency} · {c.currency[order.currency]}
                  </dd>
                </>
              )}
            </dl>
            <p className="text-xs text-subtle-foreground">{m.pricesFixed}</p>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{m.details}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-3 text-sm">
                <Field label={m.customer}>
                  {order.customer ? (
                    <Link
                      to={paths.customer(organization.id, order.customer.id)}
                      className="rounded-sm font-medium focus-ring hover:underline"
                    >
                      {order.customer.name}
                      {order.customer.companyName ? ` — ${order.customer.companyName}` : ''}
                    </Link>
                  ) : (
                    m.noCustomer
                  )}
                  {order.customer && !order.customer.isActive && (
                    <Badge className="ml-2">{m.archived}</Badge>
                  )}
                </Field>
                <Field label={m.warehouse}>
                  <Link
                    to={paths.warehouse(organization.id, order.warehouse.id)}
                    className="rounded-sm font-medium focus-ring hover:underline"
                  >
                    {order.warehouse.name} ({order.warehouse.code})
                  </Link>
                  {!order.warehouse.isActive && <Badge className="ml-2">{m.archived}</Badge>}
                </Field>
                <Field label={m.created}>{f.dateTime(order.createdAt)}</Field>
                <Field label={m.updated}>{f.dateTime(order.updatedAt)}</Field>
                {order.notes && (
                  <Field label={m.notes}>
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
                  {m.movementsIn({ code: order.warehouse.code })}
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{m.history}</CardTitle>
            </CardHeader>
            <CardContent>
              {order.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">{m.noHistory}</p>
              ) : (
                <ol className="flex flex-col gap-3 text-sm">
                  {order.history.map((entry, index) => (
                    <li key={`${entry.action}-${index}`} className="flex flex-col">
                      <span className="font-medium">
                        {m.historyLabels[entry.action as keyof typeof m.historyLabels] ??
                          entry.action}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {f.dateTime(entry.createdAt)} · {entry.actor?.name ?? m.system}
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
  const m = useMessages(sales).order;
  const f = useFormat();
  if (available === null) return <>—</>;
  return (
    <>
      {f.number(available)}
      {available < needed && <span className="block text-xs text-danger">{m.notEnough}</span>}
    </>
  );
}
