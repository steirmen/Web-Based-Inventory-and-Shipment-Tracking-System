import type { StockMovementType, StockStatus } from '@app/shared';
import { Badge } from '@/components/ui/badge';
import { MOVEMENT_TYPE_LABELS, STOCK_STATUS_LABELS } from '@/lib/inventory-params';

export function WarehouseStatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge tone="success" dot>
      Active
    </Badge>
  ) : (
    <Badge tone="neutral">Archived</Badge>
  );
}

const STOCK_TONES = {
  IN_STOCK: 'success',
  LOW_STOCK: 'warning',
  OUT_OF_STOCK: 'danger',
} as const satisfies Record<StockStatus, string>;

export function StockStatusBadge({ status }: { status: StockStatus }) {
  return (
    <Badge tone={STOCK_TONES[status]} dot>
      {STOCK_STATUS_LABELS[status]}
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
  return <Badge tone={MOVEMENT_TONES[type]}>{MOVEMENT_TYPE_LABELS[type]}</Badge>;
}
