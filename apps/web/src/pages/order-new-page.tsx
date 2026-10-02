import { BackLink } from '@/components/layout/back-link';
import { PageHeader } from '@/components/layout/page-header';
import { OrderBuilder } from '@/components/orders/order-builder';
import { useMessages } from '@/i18n/i18n-context';
import { sales } from '@/i18n/messages/sales';
import { pageTitle } from '@/lib/app-config';
import { useCurrentOrganization } from '@/lib/organization-context';
import { paths } from '@/routes/paths';

export function OrderNewPage() {
  const { organization } = useCurrentOrganization();
  const m = useMessages(sales).order;
  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`${m.newTitle} · ${organization.name}`)}</title>
      <BackLink to={paths.orders(organization.id)} label={m.back} />
      <PageHeader title={m.newTitle} description={m.newDescription} />
      <OrderBuilder order={null} />
    </div>
  );
}
