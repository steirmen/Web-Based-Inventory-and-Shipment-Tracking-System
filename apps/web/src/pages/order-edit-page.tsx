import { useParams } from 'react-router';
import { BackLink } from '@/components/layout/back-link';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, DetailSkeleton } from '@/components/layout/page-state';
import { OrderBuilder } from '@/components/orders/order-builder';
import { useOrder } from '@/hooks/use-sales';
import { hasErrorCode } from '@/lib/api-errors';
import { pageTitle } from '@/lib/app-config';
import { useCurrentOrganization } from '@/lib/organization-context';
import { ORDER_STATUS_LABELS } from '@/lib/sales-params';
import { paths } from '@/routes/paths';

/** Edits a DRAFT. Other statuses explain why they can't be edited. */
export function OrderEditPage() {
  const { organization, can } = useCurrentOrganization();
  const { orderId = '' } = useParams();
  const query = useOrder(organization.id, orderId);

  const back = <BackLink to={paths.order(organization.id, orderId)} label="Back to order" />;

  if (query.isPending) return <DetailSkeleton label="Loading order" />;
  if (query.isError) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        {hasErrorCode(query.error, 'ORDER_NOT_FOUND') ? (
          <EmptyState title="This order doesn't exist in this workspace." />
        ) : (
          <ErrorState
            title="We couldn't load this order"
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        )}
      </div>
    );
  }

  const order = query.data.order;
  const editable = order.status === 'DRAFT' && can('ORDERS_UPDATE');

  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`Edit ${order.orderNumber} · ${organization.name}`)}</title>
      {back}
      <PageHeader title={`Edit ${order.orderNumber}`} description="Only drafts can be edited." />
      {editable ? (
        <OrderBuilder key={order.id} order={order} />
      ) : (
        <EmptyState
          title={
            order.status === 'DRAFT'
              ? "You don't have permission to edit orders."
              : `This order is ${ORDER_STATUS_LABELS[order.status].toLowerCase()} and can no longer be edited.`
          }
        />
      )}
    </div>
  );
}
