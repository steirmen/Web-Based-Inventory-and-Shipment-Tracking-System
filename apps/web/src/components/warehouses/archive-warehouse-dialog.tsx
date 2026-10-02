import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useMessages } from '@/i18n/i18n-context';
import { stock } from '@/i18n/messages/stock';

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
  const m = useMessages(stock).archiveWarehouse;
  return (
    <ConfirmDialog
      open={warehouse !== null}
      title={m.title}
      description={
        <>
          <span className="font-medium text-foreground">{warehouse?.name}</span>
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
