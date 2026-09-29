import { Activity, Database, MonitorSmartphone, Server, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { appConfig, pageTitle } from '@/lib/app-config';
import { paths } from '@/routes/paths';

interface Layer {
  title: string;
  description: string;
  icon: LucideIcon;
  technologies: string[];
}

const layers: Layer[] = [
  {
    title: 'Web app',
    description:
      'Single-page application with typed routing, server-state caching, and a token-based design system.',
    icon: MonitorSmartphone,
    technologies: ['React', 'Vite', 'React Router', 'TanStack Query', 'Tailwind CSS'],
  },
  {
    title: 'API',
    description:
      'Modular HTTP API with validated configuration, request validation, and CORS for local development.',
    icon: Server,
    technologies: ['NestJS', 'TypeScript', 'Zod', 'class-validator'],
  },
  {
    title: 'Data',
    description:
      'PostgreSQL running on the local machine, accessed through Prisma with the native pg driver adapter.',
    icon: Database,
    technologies: ['PostgreSQL', 'Prisma ORM'],
  },
];

const commands = [
  { command: 'npm run dev', description: 'Start the API and the web app in watch mode' },
  { command: 'npm run test', description: 'Run all test suites' },
  { command: 'npm run lint', description: 'Lint every workspace' },
  { command: 'npm run typecheck', description: 'Type-check every workspace' },
  { command: 'npm run db:check', description: 'Verify Prisma can reach PostgreSQL' },
];

export function HomePage() {
  return (
    <div className="flex flex-col gap-8">
      <title>{pageTitle('Overview')}</title>

      <PageHeader
        eyebrow="Foundation"
        title="Project foundation"
        description={`The technical groundwork for ${appConfig.name}. Product features are built on top of this foundation in upcoming phases.`}
        actions={
          <Link to={paths.healthCheck} className={buttonVariants({ variant: 'secondary' })}>
            <Activity aria-hidden="true" />
            Check system status
          </Link>
        }
      />

      <section aria-labelledby="architecture-heading" className="flex flex-col gap-4">
        <h2 id="architecture-heading" className="text-sm font-semibold text-foreground">
          Architecture
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {layers.map(({ title, description, icon: Icon, technologies }) => (
            <Card key={title}>
              <CardHeader>
                <div className="mb-2 flex size-9 items-center justify-center rounded-control border border-border bg-surface-muted text-muted-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                </div>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto flex flex-wrap gap-1.5">
                {technologies.map((technology) => (
                  <Badge key={technology}>{technology}</Badge>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Developer commands</CardTitle>
          <CardDescription>
            Run from the repository root. See README.md for setup instructions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border rounded-control border border-border">
            {commands.map(({ command, description }) => (
              <div
                key={command}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-6"
              >
                <dt className="font-mono text-[13px] text-foreground sm:w-48 sm:shrink-0">
                  {command}
                </dt>
                <dd className="text-muted-foreground">{description}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
