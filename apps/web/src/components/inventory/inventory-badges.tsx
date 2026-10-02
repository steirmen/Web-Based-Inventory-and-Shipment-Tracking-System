import type { StockMovementType, StockStatus } from '@app/shared';
import { Badge } from '@/components/ui/badge';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';

export function WarehouseStatusBadge({ isActive }: { isActive: boolean }) {
  const m = useMessages(common).status;
  return isActive ? (
    <Badge tone="success" dot>
      {m.active}
    </Badge>
  ) : (
    <Badge tone="neutral">{m.archived}</Badge>
  );
}

const STOCK_TONES = {
  IN_STOCK: 'success',
  LOW_STOCK: 'warning',
  OUT_OF_STOCK: 'danger',
} as const satisfies Record<StockStatus, string>;

export function StockStatusBadge({ status }: { status: StockStatus }) {
  const m = useMessages(common);
  return (
    <Badge tone={STOCK_TONES[status]} dot>
      {m.stockStatus[status]}
    </Badge>
  );
}

const MOVEMENT_TONES = {
  PURCHASE: 'success',
  SALE: 'primary',
  DAMAGE: 'danger',
  ADJUSTMENT: 'warning',
  TRANSFER_OUT: 'neutral',
  TRANSFER_IN: 'neutral',
} as const satisfies Record<StockMovementType, string>;

export function MovementTypeBadge({ type }: { type: StockMovementType }) {
  const m = useMessages(common);
  return <Badge tone={MOVEMENT_TONES[type]}>{m.movementType[type]}</Badge>;
}
