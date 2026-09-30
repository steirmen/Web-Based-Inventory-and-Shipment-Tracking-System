import type { ProductListItem } from '@app/shared';
import { Archive, ArchiveRestore, Eye, Pencil } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { useCurrentOrganization } from '@/lib/organization-context';
import { paths } from '@/routes/paths';

/**
 * View / Edit / Archive-Restore for one product. Visibility follows the
 * viewer's permissions (UX only — the API enforces them).
 */
export function ProductActions({
  product,
  pending,
  onStatusChange,
}: {
  product: ProductListItem;
  pending: boolean;
  onStatusChange: (action: 'archive' | 'restore') => void;
}) {
  const { organization, can } = useCurrentOrganization();
  const linkClass = buttonVariants({ variant: 'ghost', size: 'sm' });

  return (
    <div className="flex flex-wrap items-center gap-1 xl:flex-nowrap xl:justify-end">
      <Link
        to={paths.product(organization.id, product.id)}
        className={linkClass}
        aria-label={`View ${product.name}`}
      >
        <Eye aria-hidden="true" />
        View
      </Link>
      {product.status === 'ACTIVE' && can('PRODUCTS_UPDATE') && (
        <Link
          to={paths.productEdit(organization.id, product.id)}
          className={linkClass}
          aria-label={`Edit ${product.name}`}
        >
          <Pencil aria-hidden="true" />
          Edit
        </Link>
      )}
      {can('PRODUCTS_ARCHIVE') &&
        (product.status === 'ACTIVE' ? (
          <Button
            variant="ghost"
            size="sm"
            isLoading={pending}
            onClick={() => onStatusChange('archive')}
            aria-label={`Archive ${product.name}`}
          >
            {!pending && <Archive aria-hidden="true" />}
            Archive
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            isLoading={pending}
            onClick={() => onStatusChange('restore')}
            aria-label={`Restore ${product.name}`}
          >
            {!pending && <ArchiveRestore aria-hidden="true" />}
            Restore
          </Button>
        ))}
    </div>
  );
}
