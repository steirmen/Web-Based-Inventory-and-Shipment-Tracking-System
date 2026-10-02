import type { OrderStatus } from '@app/shared';
import { Badge } from '@/components/ui/badge';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';

const TONES = {
  DRAFT: 'neutral',
  CONFIRMED: 'primary',
  PROCESSING: 'warning',
  SHIPPED: 'primary',
  COMPLETED: 'success',
  CANCELLED: 'danger',
} as const satisfies Record<OrderStatus, string>;

/** Status as text (the color is only a supporting cue). */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const m = useMessages(common);
  return (
    <Badge tone={TONES[status]} dot>
      {m.orderStatus[status]}
    </Badge>
  );
}

export function ActiveBadge({ isActive }: { isActive: boolean }) {
  const m = useMessages(common).status;
  return isActive ? (
    <Badge tone="success" dot>
      {m.active}
    </Badge>
  ) : (
    <Badge tone="neutral">{m.archived}</Badge>
  );
}
