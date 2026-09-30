import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/** Confirmation before archiving. Restoring needs no confirmation. */
export function ArchiveProductDialog({
  product,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  /** The product to archive; `null` keeps the dialog closed. */
  product: { name: string } | null;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open={product !== null}
      title="Archive product?"
      description={
        <>
          <span className="font-medium text-foreground">{product?.name}</span> will be marked as
          archived and can&apos;t be edited while archived. It can be restored later.
        </>
      }
      confirmLabel="Archive"
      tone="danger"
      pending={pending}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
