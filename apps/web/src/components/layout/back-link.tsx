import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';

/**
 * "← Products": the way up from a detail, create, or edit page to its list
 * (or parent). Same look on every page, above the `PageHeader`.
 */
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="-ml-1 inline-flex items-center gap-1.5 self-start rounded-control px-1 py-0.5 text-sm font-medium text-muted-foreground focus-ring transition-colors duration-150 hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
