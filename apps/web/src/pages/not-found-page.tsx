import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { buttonVariants } from '@/components/ui/button-variants';
import { pageTitle } from '@/lib/app-config';
import { paths } from '@/routes/paths';

export function NotFoundPage() {
  return (
    <div className="flex flex-col gap-8">
      <title>{pageTitle('Page not found')}</title>
      <PageHeader
        eyebrow="404"
        title="Page not found"
        description="The page you are looking for does not exist or has moved."
        actions={
          <Link to={paths.home} className={buttonVariants({ variant: 'secondary' })}>
            Back to overview
          </Link>
        }
      />
    </div>
  );
}
