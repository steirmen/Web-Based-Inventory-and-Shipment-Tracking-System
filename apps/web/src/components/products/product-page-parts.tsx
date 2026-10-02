import { Lock, SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { BackLink } from '@/components/layout/back-link';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/page-state';
import { buttonVariants } from '@/components/ui/button-variants';
import { useMessages } from '@/i18n/i18n-context';
import { catalog } from '@/i18n/messages/catalog';
import { pageTitle } from '@/lib/app-config';
import { useCurrentOrganization } from '@/lib/organization-context';
import { paths } from '@/routes/paths';

/** "← Products" link above product pages. */
export function BackToProducts() {
  const { organization } = useCurrentOrganization();
  const m = useMessages(catalog).pages;
  return <BackLink to={paths.products(organization.id)} label={m.back} />;
}

/** Unknown product, or one from another organization (the API answers 404 for both). */
export function ProductNotFound() {
  const { organization } = useCurrentOrganization();
  const m = useMessages(catalog).pages;
  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`${m.notFoundTitle} · ${organization.name}`)}</title>
      <BackToProducts />
      <PageHeader title={m.notFoundTitle} />
      <EmptyState
        icon={<SearchX className="size-5" aria-hidden="true" />}
        title={m.notFoundText}
        description={m.notFoundHint}
        action={
          <Link
            to={paths.products(organization.id)}
            className={buttonVariants({ variant: 'secondary' })}
          >
            {m.viewAll}
          </Link>
        }
      />
    </div>
  );
}

/** Shown instead of a form when the viewer's role can't use it (the API would reject it too). */
export function NotAllowed({ title, description }: { title: string; description: string }) {
  const { organization } = useCurrentOrganization();
  const m = useMessages(catalog).pages;
  return (
    <div className="flex flex-col gap-6">
      <title>{pageTitle(`${title} · ${organization.name}`)}</title>
      <BackToProducts />
      <PageHeader title={title} />
      <EmptyState
        icon={<Lock className="size-5" aria-hidden="true" />}
        title={m.noAccess}
        description={description}
      />
    </div>
  );
}
