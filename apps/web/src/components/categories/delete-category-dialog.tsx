import type { Category } from '@app/shared';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { useMessages } from '@/i18n/i18n-context';
import { catalog } from '@/i18n/messages/catalog';
import { hasErrorCode, useApiErrorMessage } from '@/lib/api-errors';
import { useCurrentOrganization } from '@/lib/organization-context';
import { categoryProductsPath } from '@/lib/product-list-params';

/**
 * Delete flow for a category. A category that still has products can't be
 * deleted (the API answers CATEGORY_IN_USE), so instead of a confirmation the
 * dialog explains why and links to those products.
 */
export function DeleteCategoryDialog({
  category,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  /** `null` keeps the dialog closed. */
  category: Category | null;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { organization } = useCurrentOrganization();
  const m = useMessages(catalog).deleteCategory;
  const errorMessage = useApiErrorMessage();
  // The count may be stale; a CATEGORY_IN_USE answer from the API switches to the explanation too.
  const inUse =
    category !== null && (category.productCount > 0 || hasErrorCode(error, 'CATEGORY_IN_USE'));

  if (category && inUse) {
    const count = category.productCount;
    return (
      <Dialog
        open
        onClose={onCancel}
        title={m.blockedTitle}
        description={
          count === 1
            ? m.usedByOne({ name: category.name })
            : count > 1
              ? m.usedByMany({ name: category.name, count })
              : errorMessage(error)
        }
        footer={
          <>
            <Button variant="secondary" onClick={onCancel} data-autofocus>
              {m.close}
            </Button>
            <Link
              to={categoryProductsPath(organization.id, category.id)}
              className={buttonVariants()}
            >
              {m.viewProducts}
            </Link>
          </>
        }
      >
        <Alert tone="info">{m.archivedCount}</Alert>
      </Dialog>
    );
  }

  return (
    <ConfirmDialog
      open={category !== null}
      title={m.title}
      description={
        <>
          <span className="font-medium text-foreground">{category?.name}</span>
          {m.text}
        </>
      }
      confirmLabel={m.confirm}
      tone="danger"
      pending={pending}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
