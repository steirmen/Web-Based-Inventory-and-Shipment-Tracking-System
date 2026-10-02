import type { ProductListItem } from '@app/shared';
import { Archive, ArchiveRestore, Eye, Pencil } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { useMessages } from '@/i18n/i18n-context';
import { catalog } from '@/i18n/messages/catalog';
import { useCurrentOrganization } from '@/lib/organization-context';
import { paths } from '@/routes/paths';

/**
 * View / Edit / Archive-Restore for one product. Visibility follows the
 * viewer's permissions (UX only — the API enforces them). `compact` (table
 * rows) shows icon-only buttons with the same accessible names and a tooltip.
 */
export function ProductActions({
  product,
  pending,
  onStatusChange,
  compact = false,
}: {
  product: ProductListItem;
  pending: boolean;
  onStatusChange: (action: 'archive' | 'restore') => void;
  compact?: boolean;
}) {
  const { organization, can } = useCurrentOrganization();
  const m = useMessages(catalog).actions;
  const size = compact ? 'icon-sm' : 'sm';
  const linkClass = buttonVariants({ variant: 'ghost', size });

  return (
    <div className="flex flex-wrap items-center gap-1 @4xl:flex-nowrap @4xl:justify-end">
      <Link
        to={paths.product(organization.id, product.id)}
        className={linkClass}
        aria-label={m.viewNamed({ name: product.name })}
        title={compact ? m.view : undefined}
      >
        <Eye aria-hidden="true" />
        {!compact && m.view}
      </Link>
      {product.status === 'ACTIVE' && can('PRODUCTS_UPDATE') && (
        <Link
          to={paths.productEdit(organization.id, product.id)}
          className={linkClass}
          aria-label={m.editNamed({ name: product.name })}
          title={compact ? m.edit : undefined}
        >
          <Pencil aria-hidden="true" />
          {!compact && m.edit}
        </Link>
      )}
      {can('PRODUCTS_ARCHIVE') &&
        (product.status === 'ACTIVE' ? (
          <Button
            variant="ghost"
            size={size}
            isLoading={pending}
            onClick={() => onStatusChange('archive')}
            aria-label={m.archiveNamed({ name: product.name })}
            title={compact ? m.archive : undefined}
          >
            {!pending && <Archive aria-hidden="true" />}
            {!compact && m.archive}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size={size}
            isLoading={pending}
            onClick={() => onStatusChange('restore')}
            aria-label={m.restoreNamed({ name: product.name })}
            title={compact ? m.restore : undefined}
          >
            {!pending && <ArchiveRestore aria-hidden="true" />}
            {!compact && m.restore}
          </Button>
        ))}
    </div>
  );
}
