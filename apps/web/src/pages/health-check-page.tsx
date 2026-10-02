import type { DependencyStatus } from '@app/shared';
import { Database, Globe, RefreshCw, type LucideIcon } from 'lucide-react';
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
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { workspace } from '@/i18n/messages/workspace';
import { pageTitle } from '@/lib/app-config';
import { getApiBaseUrl } from '@/lib/env';

type CheckState = 'pending' | 'up' | 'degraded' | 'down' | 'unknown';

const STATE_TONES = {
  pending: 'neutral',
  up: 'success',
  degraded: 'warning',
  down: 'danger',
  unknown: 'neutral',
} as const satisfies Record<CheckState, string>;

function StateBadge({ state }: { state: CheckState }) {
  const m = useMessages(workspace).health;
  const tone = STATE_TONES[state];
  return (
    <Badge tone={tone} dot={tone !== 'neutral'}>
      {m.states[state]}
    </Badge>
  );
}

/**
 * Technical page that exercises the full request path:
 * browser → API (`GET /health`) → PostgreSQL (via Prisma).
 */
export function HealthCheckPage() {
  const { data, error, isPending, isError, isFetching, refetch } = useHealthCheck();

  const m = useMessages(workspace).health;
  const f = useFormat();
  const apiBaseUrl = readApiBaseUrl(m.noBaseUrl);
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
      <title>{pageTitle(m.pageTitle)}</title>

      <PageHeader
        eyebrow={m.eyebrow}
        title={m.title}
        description={m.description}
        actions={
          <Button variant="secondary" onClick={() => void refetch()} isLoading={isFetching}>
            {!isFetching && <RefreshCw aria-hidden="true" />}
            {m.run}
          </Button>
        }
      />

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle>{m.connectivity}</CardTitle>
            <CardDescription>{m.connectivityText}</CardDescription>
          </div>
          <StateBadge state={overall} />
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <ul className="divide-y divide-border rounded-control border border-border">
            <CheckRow
              icon={Globe}
              name={m.webToApi}
              detail={`GET ${apiBaseUrl}/health`}
              state={apiState}
            />
            <CheckRow
              icon={Database}
              name={m.apiToDb}
              detail="Prisma query: SELECT 1"
              state={databaseState}
            />
          </ul>

          {isPending && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Spinner size="sm" label={m.checking} />
              <span>{m.contacting}</span>
            </div>
          )}

          {isError && (
            <Alert tone="danger" title={m.apiDown}>
              <p>{error.message}</p>
              <p className="mt-1">
                {m.apiDownBefore}
                <code className="font-mono">npm run dev:api</code>
                {m.apiDownMiddle}
                <code className="font-mono">VITE_API_BASE_URL</code>
                {m.apiDownAfter}
              </p>
            </Alert>
          )}

          {databaseState === 'down' && (
            <Alert tone="warning" title={m.dbDown}>
              {m.dbDownText} <code className="font-mono">npm run db:check</code>
            </Alert>
          )}
        </CardContent>

        {data && !isError && (
          <CardFooter className="flex-wrap gap-x-6 gap-y-1 text-xs">
            <Meta label={m.responseTime} value={`${f.number(data.latencyMs)} ms`} />
            <Meta label={m.uptime} value={formatDuration(data.response.uptime)} />
            <Meta label={m.checkedAt} value={f.time(data.response.timestamp)} />
          </CardFooter>
        )}
      </Card>

      {data && !isError && (
        <Card>
          <CardHeader>
            <CardTitle>{m.raw}</CardTitle>
            <CardDescription>{m.rawText}</CardDescription>
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
      <StateBadge state={state} />
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

function readApiBaseUrl(fallback: string): string {
  try {
    return getApiBaseUrl();
  } catch {
    return fallback;
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
