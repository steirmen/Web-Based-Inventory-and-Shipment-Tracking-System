import { ArrowLeft, Lock, SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/page-state';
import { buttonVariants } from '@/components/ui/button-variants';
import { pageTitle } from '@/lib/app-config';
import { useCurrentOrganization } from '@/lib/organization-context';
import { paths } from '@/routes/paths';

/** "← Products" link above product pages. */
export function BackToProducts() {
  const { organization } = useCurrentOrganization();
  return (
    <Link
      to={paths.products(organization.id)}
      className="inline-flex items-center gap-1.5 self-start rounded-sm text-sm font-medium text-muted-foreground focus-ring hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Products
    </Link>
  );
}

/** Unknown product, or one from another organization (the API answers 404 for both). */
export function ProductNotFound() {
  const { organization } = useCurrentOrganization();
  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`Product not found · ${organization.name}`)}</title>
      <BackToProducts />
      <PageHeader title="Product not found" />
      <EmptyState
        icon={<SearchX className="size-5" aria-hidden="true" />}
        title="This product doesn't exist in this workspace."
        description="It may have been removed, or the link may be wrong."
        action={
          <Link
            to={paths.products(organization.id)}
            className={buttonVariants({ variant: 'secondary' })}
          >
            View all products
          </Link>
        }
      />
    </div>
  );
}

/** Shown instead of a form when the viewer's role can't use it (the API would reject it too). */
export function NotAllowed({ title, description }: { title: string; description: string }) {
  const { organization } = useCurrentOrganization();
  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`${title} · ${organization.name}`)}</title>
      <BackToProducts />
      <PageHeader title={title} />
      <EmptyState
        icon={<Lock className="size-5" aria-hidden="true" />}
        title="You don't have access to this action"
        description={description}
      />
    </div>
  );
}
