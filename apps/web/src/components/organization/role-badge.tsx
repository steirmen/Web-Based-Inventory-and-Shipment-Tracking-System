import type { MemberRole } from '@app/shared';
import { Badge } from '@/components/ui/badge';
import { ROLE_LABELS } from '@/lib/organization-form';

export function RoleBadge({ role }: { role: MemberRole }) {
  return (
    <Badge tone={role === 'OWNER' ? 'primary' : 'neutral'} dot={role === 'OWNER'}>
      {ROLE_LABELS[role]}
    </Badge>
  );
}
