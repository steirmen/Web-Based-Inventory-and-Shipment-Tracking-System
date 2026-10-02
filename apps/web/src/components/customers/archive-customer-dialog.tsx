import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useMessages } from '@/i18n/i18n-context';
import { sales } from '@/i18n/messages/sales';

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
  const m = useMessages(sales).archiveCustomer;
  return (
    <ConfirmDialog
      open={customer !== null}
      title={m.title}
      description={
        <>
          <span className="font-medium text-foreground">{customer?.name}</span>
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
