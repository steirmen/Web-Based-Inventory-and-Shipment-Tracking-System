import type { DependencyStatus } from '@app/shared';
import { Database, Globe, RefreshCw, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useHealthCheck } from '@/hooks/use-health-check';
import { pageTitle } from '@/lib/app-config';
import { getApiBaseUrl } from '@/lib/env';

type CheckState = 'pending' | 'up' | 'degraded' | 'down' | 'unknown';

const stateBadges: Record<CheckState, ReactNode> = {
  pending: <Badge tone="neutral">Checking…</Badge>,
  up: (
    <Badge tone="success" dot>
      Operational
    </Badge>
  ),
  degraded: (
    <Badge tone="warning" dot>
      Degraded
    </Badge>
  ),
  down: (
    <Badge tone="danger" dot>
      Unavailable
    </Badge>
  ),
  unknown: <Badge tone="neutral">Unknown</Badge>,
};

/**
 * Technical page that exercises the full request path:
 * browser → API (`GET /health`) → PostgreSQL (via Prisma).
 */
export function HealthCheckPage() {
  const { data, error, isPending, isError, isFetching, refetch } = useHealthCheck();

  const apiBaseUrl = readApiBaseUrl();
  const overall: CheckState = isPending
    ? 'pending'
    : isError
      ? 'down'
      : data.response.status === 'ok'
        ? 'up'
        : 'degraded';
  const apiState: CheckState = isPending ? 'pending' : isError ? 'down' : 'up';
  const databaseState: CheckState = isPending
    ? 'pending'
    : isError
      ? 'unknown'
      : fromDependency(data.response.checks.database);

  return (
    <div className="flex flex-col gap-8">
      <title>{pageTitle('System status')}</title>

      <PageHeader
        eyebrow="Diagnostics"
        title="System status"
        description="Verifies that this web app can reach the API, and that the API can reach the database."
        actions={
          <Button variant="secondary" onClick={() => void refetch()} isLoading={isFetching}>
            {!isFetching && <RefreshCw aria-hidden="true" />}
            Run check
          </Button>
        }
      />

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Connectivity</CardTitle>
            <CardDescription>Live result of the API health endpoint.</CardDescription>
          </div>
          {stateBadges[overall]}
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <ul className="divide-y divide-border rounded-control border border-border">
            <CheckRow
              icon={Globe}
              name="Web app → API"
              detail={`GET ${apiBaseUrl}/health`}
              state={apiState}
            />
            <CheckRow
              icon={Database}
              name="API → PostgreSQL"
              detail="Prisma query: SELECT 1"
              state={databaseState}
            />
          </ul>

          {isPending && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Spinner size="sm" label="Checking API status" />
              <span>Contacting the API…</span>
            </div>
          )}

          {isError && (
            <Alert tone="danger" title="API unreachable">
              <p>{error.message}</p>
              <p className="mt-1">
                Make sure the API is running (<code className="font-mono">npm run dev:api</code>)
                and that <code className="font-mono">VITE_API_BASE_URL</code> points to it.
              </p>
            </Alert>
          )}

          {databaseState === 'down' && (
            <Alert tone="warning" title="Database unreachable">
              The API is running but cannot connect to PostgreSQL. Check that the PostgreSQL service
              is started and that the <code className="font-mono">DB_*</code> values in{' '}
              <code className="font-mono">.env</code> are correct, then run{' '}
              <code className="font-mono">npm run db:check</code>.
            </Alert>
          )}
        </CardContent>

        {data && !isError && (
          <CardFooter className="flex-wrap gap-x-6 gap-y-1 text-xs">
            <Meta label="Response time" value={`${data.latencyMs} ms`} />
            <Meta label="API uptime" value={formatDuration(data.response.uptime)} />
            <Meta
              label="Checked at"
              value={new Date(data.response.timestamp).toLocaleTimeString()}
            />
          </CardFooter>
        )}
      </Card>

      {data && !isError && (
        <Card>
          <CardHeader>
            <CardTitle>Raw response</CardTitle>
            <CardDescription>Body returned by GET /health.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-control border border-border bg-surface-muted p-4 font-mono text-xs leading-5 text-foreground">
              {JSON.stringify(data.response, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CheckRow({
  icon: Icon,
  name,
  detail,
  state,
}: {
  icon: LucideIcon;
  name: string;
  detail: string;
  state: CheckState;
}) {
  return (
    <li className="flex items-center gap-4 px-4 py-3">
      <Icon className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium text-foreground">{name}</span>
        <span className="truncate font-mono text-xs text-muted-foreground">{detail}</span>
      </div>
      {stateBadges[state]}
    </li>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <span>
      {label}: <span className="font-medium text-foreground tabular-nums">{value}</span>
    </span>
  );
}

function fromDependency(status: DependencyStatus): CheckState {
  return status === 'up' ? 'up' : 'down';
}

function readApiBaseUrl(): string {
  try {
    return getApiBaseUrl();
  } catch {
    return '(VITE_API_BASE_URL not set)';
  }
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
