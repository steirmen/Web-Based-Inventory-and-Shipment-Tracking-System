import { BackLink } from '@/components/layout/back-link';
import { PageHeader } from '@/components/layout/page-header';
import { OrderBuilder } from '@/components/orders/order-builder';
import { pageTitle } from '@/lib/app-config';
import { useCurrentOrganization } from '@/lib/organization-context';
import { paths } from '@/routes/paths';

export function OrderNewPage() {
  const { organization } = useCurrentOrganization();
  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`New order · ${organization.name}`)}</title>
      <BackLink to={paths.orders(organization.id)} label="Orders" />
      <PageHeader
        title="New order"
        description="Starts as a draft. Stock is only deducted when the confirmed order is processed."
      />
      <OrderBuilder order={null} />
    </div>
  );
}
