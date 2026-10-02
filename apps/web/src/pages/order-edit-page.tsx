import { useParams } from 'react-router';
import { BackLink } from '@/components/layout/back-link';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState, ErrorState, DetailSkeleton } from '@/components/layout/page-state';
import { OrderBuilder } from '@/components/orders/order-builder';
import { useOrder } from '@/hooks/use-sales';
import { hasErrorCode } from '@/lib/api-errors';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { sales } from '@/i18n/messages/sales';
import { pageTitle } from '@/lib/app-config';
import { useCurrentOrganization } from '@/lib/organization-context';
import { paths } from '@/routes/paths';

/** Edits a DRAFT. Other statuses explain why they can't be edited. */
export function OrderEditPage() {
  const { organization, can } = useCurrentOrganization();
  const { orderId = '' } = useParams();
  const query = useOrder(organization.id, orderId);
  const m = useMessages(sales).order;
  const c = useMessages(common);

  const back = <BackLink to={paths.order(organization.id, orderId)} label={m.backToOrder} />;

  if (query.isPending) return <DetailSkeleton label={m.loading} />;
  if (query.isError) {
    return (
      <div className="flex flex-col gap-6">
        {back}
        {hasErrorCode(query.error, 'ORDER_NOT_FOUND') ? (
          <EmptyState title={m.notFoundText} />
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

  const order = query.data.order;
  const editable = order.status === 'DRAFT' && can('ORDERS_UPDATE');

  return (
    <div className="flex flex-col gap-6">
      <title>
        {pageTitle(`${m.editTitle({ number: order.orderNumber })} · ${organization.name}`)}
      </title>
      {back}
      <PageHeader
        title={m.editTitle({ number: order.orderNumber })}
        description={m.editDescription}
      />
      {editable ? (
        <OrderBuilder key={order.id} order={order} />
      ) : (
        <EmptyState
          title={
            order.status === 'DRAFT'
              ? m.noEditPermission
              : m.notEditable({ status: c.orderStatus[order.status] })
          }
        />
      )}
    </div>
  );
}
