import type { Category } from '@app/shared';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { apiErrorMessage, hasErrorCode } from '@/lib/api-errors';
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
  // The count may be stale; a CATEGORY_IN_USE answer from the API switches to the explanation too.
  const inUse =
    category !== null && (category.productCount > 0 || hasErrorCode(error, 'CATEGORY_IN_USE'));

  if (category && inUse) {
    const count = category.productCount;
    return (
      <Dialog
        open
        onClose={onCancel}
        title="This category can't be deleted"
        description={
          count === 1
            ? `${category.name} is used by 1 product. Move that product to another category first.`
            : count > 1
              ? `${category.name} is used by ${count} products. Move them to another category first.`
              : apiErrorMessage(error)
        }
        footer={
          <>
            <Button variant="secondary" onClick={onCancel} data-autofocus>
              Close
            </Button>
            <Link
              to={categoryProductsPath(organization.id, category.id)}
              className={buttonVariants()}
            >
              View products
            </Link>
          </>
        }
      >
        <Alert tone="info">Archived products count too, because they still reference it.</Alert>
      </Dialog>
    );
  }

  return (
    <ConfirmDialog
      open={category !== null}
      title="Delete category?"
      description={
        <>
          <span className="font-medium text-foreground">{category?.name}</span> will be deleted
          permanently. This can&apos;t be undone.
        </>
      }
      confirmLabel="Delete"
      tone="danger"
      pending={pending}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
