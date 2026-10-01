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
import { apiErrorMessage, hasErrorCode } from '@/lib/api-errors';
import { pageTitle } from '@/lib/app-config';
import { formatDate, formatDateTime } from '@/lib/format';
import { formatMoney } from '@/lib/money';
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

  const back = <BackLink to={paths.customers(organization.id)} label="Customers" />;

  if (query.isPending) return <DetailSkeleton label="Loading customer" />;
  if (query.isError) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        {hasErrorCode(query.error, 'CUSTOMER_NOT_FOUND') ? (
          <>
            <title>{pageTitle('Customer not found')}</title>
            <PageHeader title="Customer not found" />
            <EmptyState
              title="This customer doesn't exist in this workspace."
              description="It may belong to another workspace, or the link is wrong."
            />
          </>
        ) : (
          <ErrorState
            title="We couldn't load this customer"
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
          setNotice(action === 'archive' ? 'Customer archived.' : 'Customer restored.');
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`${customer.name} · ${organization.name}`)}</title>
      {back}
      <PageHeader
        eyebrow="Customer"
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
                Edit
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
                  Archive
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => changeStatus('restore')}
                  isLoading={statusChange.isPending}
                >
                  <ArchiveRestore aria-hidden="true" />
                  Restore
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
        <Alert tone="danger">{apiErrorMessage(statusChange.error)}</Alert>
      )}
      {!customer.isActive && (
        <Alert tone="warning" title="This customer is archived">
          Existing orders keep this customer. Restore the customer to put them on new orders.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3 text-sm">
              <Field label="Email">{customer.email ?? '—'}</Field>
              <Field label="Phone">{customer.phone ?? '—'}</Field>
              <Field label="Address">
                <span className="whitespace-pre-line">{customer.address ?? '—'}</span>
              </Field>
              {customer.notes && (
                <Field label="Notes">
                  <span className="whitespace-pre-line">{customer.notes}</span>
                </Field>
              )}
              <Field label="Customer since">{formatDateTime(customer.createdAt)}</Field>
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
        <CardTitle>Orders</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {orders.isPending && <LoadingState label="Loading orders" />}
        {orders.isError && (
          <ErrorState
            title="We couldn't load this customer's orders"
            error={orders.error}
            onRetry={() => void orders.refetch()}
          />
        )}
        {orders.isSuccess && items.length === 0 && (
          <EmptyState
            icon={<ClipboardList className="size-5" aria-hidden="true" />}
            title="No orders yet"
            action={
              active ? (
                <Can permission="ORDERS_CREATE">
                  <Link to={paths.orderNew(organization.id)} className={buttonVariants()}>
                    <Plus aria-hidden="true" />
                    New order
                  </Link>
                </Can>
              ) : undefined
            }
          />
        )}
        {items.length > 0 && (
          <ul className="divide-y divide-border" aria-label="Recent orders">
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
                    {formatDate(order.createdAt)} · {order.warehouse.code}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium tabular-nums">
                    {formatMoney(order.total)}
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
            All {total} orders
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
