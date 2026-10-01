import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { OrderBuilder } from '@/components/orders/order-builder';
import { buttonVariants } from '@/components/ui/button-variants';
import { pageTitle } from '@/lib/app-config';
import { useCurrentOrganization } from '@/lib/organization-context';
import { paths } from '@/routes/paths';

export function OrderNewPage() {
  const { organization } = useCurrentOrganization();
  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`New order · ${organization.name}`)}</title>
      <Link
        to={paths.orders(organization.id)}
        className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'self-start' })}
      >
        <ArrowLeft aria-hidden="true" />
        All orders
      </Link>
      <PageHeader
        title="New order"
        description="Starts as a draft. Stock is only deducted when the confirmed order is processed."
      />
      <OrderBuilder order={null} />
    </div>
  );
}
