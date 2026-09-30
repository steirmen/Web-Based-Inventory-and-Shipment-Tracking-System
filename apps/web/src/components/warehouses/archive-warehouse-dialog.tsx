import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/** Confirmation before archiving a warehouse. Restoring needs no confirmation. */
export function ArchiveWarehouseDialog({
  warehouse,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  /** `null` keeps the dialog closed. */
  warehouse: { name: string } | null;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open={warehouse !== null}
      title="Archive warehouse?"
      description={
        <>
          <span className="font-medium text-foreground">{warehouse?.name}</span> keeps its stock and
          history, but no stock can be received, issued, adjusted, or transferred there until
          it&apos;s restored.
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
