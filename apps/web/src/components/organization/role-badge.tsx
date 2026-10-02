import type { MemberRole } from '@app/shared';
import { Badge } from '@/components/ui/badge';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';

export function RoleBadge({ role }: { role: MemberRole }) {
  const m = useMessages(common);
  return (
    <Badge tone={role === 'OWNER' ? 'primary' : 'neutral'} dot={role === 'OWNER'}>
      {m.roles[role]}
    </Badge>
  );
}
