import type { ProductStatus } from '@app/shared';
import { Badge } from '@/components/ui/badge';

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return status === 'ACTIVE' ? (
    <Badge tone="success" dot>
      Active
    </Badge>
  ) : (
    <Badge tone="neutral">Archived</Badge>
  );
}
