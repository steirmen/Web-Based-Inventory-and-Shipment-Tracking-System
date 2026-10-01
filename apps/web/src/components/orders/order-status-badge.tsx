import type { OrderStatus } from '@app/shared';
import { Badge } from '@/components/ui/badge';
import { ORDER_STATUS_LABELS } from '@/lib/sales-params';

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
  return (
    <Badge tone={TONES[status]} dot>
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}

export function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge tone="success" dot>
      Active
    </Badge>
  ) : (
    <Badge tone="neutral">Archived</Badge>
  );
}
