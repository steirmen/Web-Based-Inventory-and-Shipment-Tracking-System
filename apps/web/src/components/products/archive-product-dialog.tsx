import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useMessages } from '@/i18n/i18n-context';
import { catalog } from '@/i18n/messages/catalog';

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
  const m = useMessages(catalog).archiveDialog;
  return (
    <ConfirmDialog
      open={product !== null}
      title={m.title}
      description={
        <>
          <span className="font-medium text-foreground">{product?.name}</span>
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
