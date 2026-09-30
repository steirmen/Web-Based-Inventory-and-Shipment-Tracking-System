import type { ReactNode } from 'react';
import { apiErrorMessage } from '@/lib/api-errors';
import { Alert } from './alert';
import { Button } from './button';
import { Dialog } from './dialog';

/** Confirmation step for meaningful actions (archive, delete, …). Cancel gets initial focus. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  pending = false,
  error = null,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  pending?: boolean;
  error?: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      dismissible={!pending}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={pending} data-autofocus>
            Cancel
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            isLoading={pending}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error ? <Alert tone="danger">{apiErrorMessage(error)}</Alert> : null}
    </Dialog>
  );
}
