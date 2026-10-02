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
import { useMessages } from '@/i18n/i18n-context';
import { sales } from '@/i18n/messages/sales';
import { useApiErrorMessage } from '@/lib/api-errors';
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
  const m = useMessages(sales).actions;
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
          onDone(m.done[action]);
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
            {m.edit}
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
              {m.labels[action]}
            </Button>
          );
        })}
      </div>

      {info && pendingAction !== 'process' && (
        <ConfirmDialog
          open
          title={m.titles[info.action]}
          description={
            <>
              <span className="font-medium text-foreground">{order.orderNumber}</span>:{' '}
              {m.descriptions[info.action]}
            </>
          }
          confirmLabel={m.labels[info.action]}
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
  const m = useMessages(sales).actions;
  const errorMessage = useApiErrorMessage();
  const short = order.items.filter(
    (item) => item.availableQuantity !== null && item.quantity > item.availableQuantity,
  );
  // INVENTORY_INSUFFICIENT_STOCK lists every short line (field items.<orderItemId>).
  const shortages =
    error instanceof ApiError
      ? error.details.flatMap((detail) => {
          const item = order.items.find((line) => `items.${line.id}` === detail.field);
          return detail.messages.map((message) =>
            m.shortLine({ product: item?.productName ?? '', message }),
          );
        })
      : [];

  return (
    <Dialog
      open
      onClose={onCancel}
      title={m.titles.process}
      description={m.descriptions.process}
      dismissible={!pending}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={pending} data-autofocus>
            {m.cancel}
          </Button>
          <Button onClick={onConfirm} isLoading={pending}>
            {m.processOrder}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error ? (
          <Alert tone="danger" title={m.notProcessed}>
            <p>{errorMessage(error)}</p>
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
          {m.from}{' '}
          <span className="font-medium">
            {order.warehouse.name} ({order.warehouse.code})
          </span>
        </p>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="py-1 font-medium">
                {m.product}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {m.needed}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {m.inStock}
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
                    {isShort && <span className="block text-xs text-danger">{m.notEnough}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {short.length > 0 && !error && (
          <Alert tone="warning">{m.shortWarning({ count: short.length })}</Alert>
        )}
        <p className="text-xs text-subtle-foreground">{m.stockAsOf}</p>
      </div>
    </Dialog>
  );
}
