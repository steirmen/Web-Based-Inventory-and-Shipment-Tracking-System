import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { buttonVariants } from '@/components/ui/button-variants';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { pageTitle } from '@/lib/app-config';
import { paths } from '@/routes/paths';

export function NotFoundPage() {
  const m = useMessages(common).notFound;
  return (
    <div className="flex flex-col gap-8">
      <title>{pageTitle(m.title)}</title>
      <PageHeader
        eyebrow="404"
        title={m.title}
        description={m.description}
        actions={
          <Link to={paths.home} className={buttonVariants({ variant: 'secondary' })}>
            {m.back}
          </Link>
        }
      />
    </div>
  );
}
