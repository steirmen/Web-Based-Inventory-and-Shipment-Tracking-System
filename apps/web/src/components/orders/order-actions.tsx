import type { Order, OrderAction } from '@app/shared';
import { CheckCircle2, PackageCheck, Pencil, Truck, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog } from '@/components/ui/dialog';
import { useOrderAction } from '@/hooks/use-sales';
import { apiErrorMessage } from '@/lib/api-errors';
import { ApiError } from '@/api/http-client';
import { useCurrentOrganization } from '@/lib/organization-context';
import { ORDER_ACTION_INFO, ORDER_ACTIONS_BY_STATUS } from '@/lib/sales-params';
import { paths } from '@/routes/paths';

const ICONS = {
  confirm: CheckCircle2,
  process: PackageCheck,
  ship: Truck,
  complete: CheckCircle2,
  cancel: XCircle,
} as const satisfies Record<OrderAction, unknown>;

const DONE: Record<OrderAction, string> = {
  confirm: 'Order confirmed.',
  process: 'Order processed: stock was deducted.',
  ship: 'Order marked as shipped.',
  complete: 'Order completed.',
  cancel: 'Order cancelled.',
};

/**
 * The lifecycle actions this order's status allows, filtered by the viewer's
 * permissions (UX only — the API checks both again). Every action is
 * confirmed first; processing shows the stock it will take.
 */
export function OrderActions({
  order,
  onDone,
}: {
  order: Order;
  onDone: (message: string) => void;
}) {
  const { organization, can } = useCurrentOrganization();
  const mutation = useOrderAction(organization.id);
  const [pendingAction, setPendingAction] = useState<OrderAction | null>(null);
  const actions = ORDER_ACTIONS_BY_STATUS[order.status].filter((action) =>
    can(ORDER_ACTION_INFO[action].permission),
  );
  const canEdit = order.status === 'DRAFT' && can('ORDERS_UPDATE');

  const open = (action: OrderAction) => {
    mutation.reset();
    setPendingAction(action);
  };
  const close = () => {
    if (!mutation.isPending) setPendingAction(null);
  };
  const run = () => {
    if (!pendingAction || mutation.isPending) return;
    const action = pendingAction;
    mutation.mutate(
      { orderId: order.id, action },
      {
        onSuccess: () => {
          setPendingAction(null);
          onDone(DONE[action]);
        },
      },
    );
  };

  // Keep an open dialog mounted even when the order has moved on (e.g. a 409 because someone
  // else cancelled it): its error explains what happened until the user closes it.
  if (actions.length === 0 && !canEdit && pendingAction === null) return null;
  const info = pendingAction ? ORDER_ACTION_INFO[pendingAction] : null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <Link
            to={paths.orderEdit(organization.id, order.id)}
            className={buttonVariants({ variant: 'secondary' })}
          >
            <Pencil aria-hidden="true" />
            Edit
          </Link>
        )}
        {actions.map((action) => {
          const Icon = ICONS[action];
          return (
            <Button
              key={action}
              variant={action === 'cancel' ? 'secondary' : 'primary'}
              onClick={() => open(action)}
            >
              <Icon aria-hidden="true" />
              {ORDER_ACTION_INFO[action].label}
            </Button>
          );
        })}
      </div>

      {info && pendingAction !== 'process' && (
        <ConfirmDialog
          open
          title={info.title}
          description={
            <>
              <span className="font-medium text-foreground">{order.orderNumber}</span>:{' '}
              {info.description}
            </>
          }
          confirmLabel={info.label}
          tone={info.tone}
          pending={mutation.isPending}
          error={mutation.error}
          onConfirm={run}
          onCancel={close}
        />
      )}
      {pendingAction === 'process' && (
        <ProcessDialog
          order={order}
          pending={mutation.isPending}
          error={mutation.error}
          onConfirm={run}
          onCancel={close}
        />
      )}
    </>
  );
}

/** Before processing: what will leave which warehouse, against the stock known right now. */
function ProcessDialog({
  order,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  order: Order;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const info = ORDER_ACTION_INFO.process;
  const short = order.items.filter(
    (item) => item.availableQuantity !== null && item.quantity > item.availableQuantity,
  );
  // INVENTORY_INSUFFICIENT_STOCK lists every short line (field items.<orderItemId>).
  const shortages =
    error instanceof ApiError ? error.details.flatMap((detail) => detail.messages) : [];

  return (
    <Dialog
      open
      onClose={onCancel}
      title={info.title}
      description={info.description}
      dismissible={!pending}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={pending} data-autofocus>
            Cancel
          </Button>
          <Button onClick={onConfirm} isLoading={pending}>
            Process order
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error ? (
          <Alert tone="danger" title="The order was not processed">
            <p>{apiErrorMessage(error)}</p>
            {shortages.length > 1 && (
              <ul className="mt-1 list-disc pl-5">
                {shortages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
          </Alert>
        ) : null}
        <p className="text-sm">
          From{' '}
          <span className="font-medium">
            {order.warehouse.name} ({order.warehouse.code})
          </span>
        </p>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="py-1 font-medium">
                Product
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Needed
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                In stock
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {order.items.map((item) => {
              const isShort =
                item.availableQuantity !== null && item.quantity > item.availableQuantity;
              return (
                <tr key={item.id}>
                  <td className="py-1.5 pr-2">
                    <span className="block">{item.productName}</span>
                    <span className="font-mono text-xs text-muted-foreground">{item.sku}</span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{item.quantity}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {item.availableQuantity ?? '—'}
                    {isShort && <span className="block text-xs text-danger">Not enough</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {short.length > 0 && !error && (
          <Alert tone="warning">
            {short.length === 1 ? 'One line has' : `${short.length} lines have`} less stock than
            needed right now. Processing will fail unless stock arrives first; nothing is deducted
            partially.
          </Alert>
        )}
        <p className="text-xs text-subtle-foreground">
          Stock shown as of when this page loaded. The final check happens when you process.
        </p>
      </div>
    </Dialog>
  );
}
