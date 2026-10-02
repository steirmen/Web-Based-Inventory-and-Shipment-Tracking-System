import { Archive, ArchiveRestore, ClipboardList, Pencil, Plus } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useParams } from 'react-router';
import { BackLink } from '@/components/layout/back-link';
import { ArchiveCustomerDialog } from '@/components/customers/archive-customer-dialog';
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog';
import { PageHeader } from '@/components/layout/page-header';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  DetailSkeleton,
} from '@/components/layout/page-state';
import { ActiveBadge, OrderStatusBadge } from '@/components/orders/order-status-badge';
import { Can } from '@/components/organization/can';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCustomer, useCustomerStatusChange, useOrders } from '@/hooks/use-sales';
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { sales } from '@/i18n/messages/sales';
import { hasErrorCode, useApiErrorMessage } from '@/lib/api-errors';
import { pageTitle } from '@/lib/app-config';
import { useCurrentOrganization } from '@/lib/organization-context';
import { customerOrdersPath } from '@/lib/sales-params';
import { paths } from '@/routes/paths';

const RECENT_ORDERS = 5;

export function CustomerDetailPage() {
  const { organization } = useCurrentOrganization();
  const { customerId = '' } = useParams();
  const query = useCustomer(organization.id, customerId);
  const statusChange = useCustomerStatusChange(organization.id);
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const s = useMessages(sales);
  const m = s.customer;
  const f = useFormat();
  const errorMessage = useApiErrorMessage();

  const back = <BackLink to={paths.customers(organization.id)} label={m.back} />;

  if (query.isPending) return <DetailSkeleton label={m.loading} />;
  if (query.isError) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        {hasErrorCode(query.error, 'CUSTOMER_NOT_FOUND') ? (
          <>
            <title>{pageTitle(m.notFoundTitle)}</title>
            <PageHeader title={m.notFoundTitle} />
            <EmptyState title={m.notFoundText} description={m.notFoundHint} />
          </>
        ) : (
          <ErrorState
            title={m.loadError}
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
      </div>
    );
  }

  const customer = query.data.customer;
  const changeStatus = (action: 'archive' | 'restore') => {
    setNotice(null);
    statusChange.mutate(
      { customerId: customer.id, action },
      {
        onSuccess: () => {
          setConfirmArchive(false);
          setNotice(action === 'archive' ? m.archivedNotice : m.restoredNotice);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`${customer.name} · ${organization.name}`)}</title>
      {back}
      <PageHeader
        eyebrow={m.eyebrow}
        title={
          <span className="inline-flex flex-wrap items-center gap-3 break-words">
            {customer.name}
            <ActiveBadge isActive={customer.isActive} />
          </span>
        }
        description={customer.companyName ?? undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Can permission="CUSTOMERS_UPDATE">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil aria-hidden="true" />
                {s.customers.edit}
              </Button>
            </Can>
            <Can permission="CUSTOMERS_ARCHIVE">
              {customer.isActive ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    statusChange.reset();
                    setConfirmArchive(true);
                  }}
                >
                  <Archive aria-hidden="true" />
                  {s.customers.archive}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => changeStatus('restore')}
                  isLoading={statusChange.isPending}
                >
                  <ArchiveRestore aria-hidden="true" />
                  {s.customers.restore}
                </Button>
              )}
            </Can>
          </div>
        }
      />

      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {statusChange.isError && !confirmArchive && (
        <Alert tone="danger">{errorMessage(statusChange.error)}</Alert>
      )}
      {!customer.isActive && (
        <Alert tone="warning" title={m.archivedTitle}>
          {m.archivedText}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{m.contact}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3 text-sm">
              <Field label={m.email}>{customer.email ?? '—'}</Field>
              <Field label={m.phone}>{customer.phone ?? '—'}</Field>
              <Field label={m.address}>
                <span className="whitespace-pre-line">{customer.address ?? '—'}</span>
              </Field>
              {customer.notes && (
                <Field label={m.notes}>
                  <span className="whitespace-pre-line">{customer.notes}</span>
                </Field>
              )}
              <Field label={m.since}>{f.dateTime(customer.createdAt)}</Field>
            </dl>
          </CardContent>
        </Card>
        <RecentOrders
          customerId={customer.id}
          total={customer.orderCount}
          active={customer.isActive}
        />
      </div>

      <CustomerFormDialog
        open={editing}
        customer={customer}
        onClose={() => setEditing(false)}
        onSaved={(message) => {
          setEditing(false);
          setNotice(message);
        }}
      />
      <ArchiveCustomerDialog
        customer={confirmArchive ? customer : null}
        pending={statusChange.isPending}
        error={statusChange.error}
        onConfirm={() => changeStatus('archive')}
        onCancel={() => setConfirmArchive(false)}
      />
    </div>
  );
}

function RecentOrders({
  customerId,
  total,
  active,
}: {
  customerId: string;
  total: number;
  active: boolean;
}) {
  const { organization } = useCurrentOrganization();
  const m = useMessages(sales).customer;
  const f = useFormat();
  const orders = useOrders(organization.id, {
    customerId,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    page: 1,
    pageSize: RECENT_ORDERS,
  });
  const items = orders.data?.items ?? [];

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>{m.orders}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {orders.isPending && <LoadingState label={m.loadingOrders} />}
        {orders.isError && (
          <ErrorState
            title={m.ordersError}
            error={orders.error}
            onRetry={() => void orders.refetch()}
          />
        )}
        {orders.isSuccess && items.length === 0 && (
          <EmptyState
            icon={<ClipboardList className="size-5" aria-hidden="true" />}
            title={m.noOrders}
            action={
              active ? (
                <Can permission="ORDERS_CREATE">
                  <Link to={paths.orderNew(organization.id)} className={buttonVariants()}>
                    <Plus aria-hidden="true" />
                    {m.newOrder}
                  </Link>
                </Can>
              ) : undefined
            }
          />
        )}
        {items.length > 0 && (
          <ul className="divide-y divide-border" aria-label={m.recentOrders}>
            {items.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <div className="min-w-0">
                  <Link
                    to={paths.order(organization.id, order.id)}
                    className="rounded-sm font-medium focus-ring hover:underline"
                  >
                    {order.orderNumber}
                  </Link>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {f.date(order.createdAt)} · {order.warehouse.code}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium tabular-nums">
                    {f.money(order.total, order.currency)}
                  </span>
                  <OrderStatusBadge status={order.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {total > items.length && items.length > 0 && (
          <Link
            to={customerOrdersPath(organization.id, customerId)}
            className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'self-start' })}
          >
            {m.allOrders({ count: f.number(total) })}
          </Link>
        )}
      </CardContent>
    </Card>
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
