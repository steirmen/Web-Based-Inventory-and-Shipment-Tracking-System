import type { ProductStatus } from '@app/shared';
import { Badge } from '@/components/ui/badge';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const m = useMessages(common).status;
  return status === 'ACTIVE' ? (
    <Badge tone="success" dot>
      {m.active}
    </Badge>
  ) : (
    <Badge tone="neutral">{m.archived}</Badge>
  );
}
