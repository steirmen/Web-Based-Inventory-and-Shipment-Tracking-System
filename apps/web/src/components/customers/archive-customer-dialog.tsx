import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/** Confirmation before archiving a customer. Restoring needs no confirmation. */
export function ArchiveCustomerDialog({
  customer,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  /** `null` keeps the dialog closed. */
  customer: { name: string } | null;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open={customer !== null}
      title="Archive customer?"
      description={
        <>
          <span className="font-medium text-foreground">{customer?.name}</span> stays on their
          existing orders but can&apos;t be chosen for new orders until restored.
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
