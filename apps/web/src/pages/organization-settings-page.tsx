import { ORGANIZATION_LIMITS } from '@app/shared';
import { type FormEvent, useState } from 'react';
import { Can } from '@/components/organization/can';
import { PageHeader } from '@/components/layout/page-header';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useUpdateOrganization } from '@/hooks/use-organizations';
import { useFormat } from '@/i18n/format';
import { useMessages } from '@/i18n/i18n-context';
import { workspace } from '@/i18n/messages/workspace';
import { useApiErrorMessage } from '@/lib/api-errors';
import { pageTitle } from '@/lib/app-config';
import { useCurrentOrganization } from '@/lib/organization-context';
import { validateOrganizationName } from '@/lib/organization-form';

export function OrganizationSettingsPage() {
  const { organization } = useCurrentOrganization();
  const m = useMessages(workspace).settings;
  const f = useFormat();

  return (
    <div className="flex flex-col gap-8">
      <title>{pageTitle(`${m.title} · ${organization.name}`)}</title>
      <PageHeader title={m.title} description={m.description} />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{m.details}</CardTitle>
          <CardDescription>
            <Can permission="ORGANIZATION_UPDATE" fallback={m.readOnly}>
              {m.nameShown}
            </Can>
          </CardDescription>
        </CardHeader>
        <Can permission="ORGANIZATION_UPDATE" fallback={<ReadOnlyName name={organization.name} />}>
          <RenameForm />
        </Can>
        <CardContent className="flex flex-col gap-4 border-t border-border pt-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="font-medium">{m.slug}</dt>
              <dd className="font-mono text-[0.8125rem] break-all text-muted-foreground">
                {organization.slug}
              </dd>
              <dd className="text-xs text-subtle-foreground">{m.slugFixed}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="font-medium">{m.created}</dt>
              <dd className="text-muted-foreground">{f.date(organization.createdAt)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function ReadOnlyName({ name }: { name: string }) {
  const m = useMessages(workspace).settings;
  return (
    <CardContent>
      <p className="text-sm font-medium">{m.name}</p>
      <p className="mt-1 text-sm text-muted-foreground">{name}</p>
    </CardContent>
  );
}

function RenameForm() {
  const { organization } = useCurrentOrganization();
  const update = useUpdateOrganization(organization.id);
  const [name, setName] = useState(organization.name);
  const [error, setError] = useState<string>();
  const w = useMessages(workspace);
  const m = w.settings;
  const errorMessage = useApiErrorMessage();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (update.isPending) return;
    const validation = validateOrganizationName(name, w.validation);
    setError(validation);
    if (validation) return;
    update.mutate(name.trim());
  };

  const unchanged = name.trim() === organization.name;

  return (
    <form noValidate onSubmit={onSubmit}>
      <CardContent className="flex flex-col gap-4">
        {update.isError && <Alert tone="danger">{errorMessage(update.error)}</Alert>}
        {update.isSuccess && unchanged && <Alert tone="success">{m.saved}</Alert>}
        <FormField label={m.name} error={error}>
          {(control) => (
            <Input
              {...control}
              name="name"
              maxLength={ORGANIZATION_LIMITS.nameMaxLength}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(undefined);
              }}
            />
          )}
        </FormField>
      </CardContent>
      <CardFooter className="justify-end">
        <Button type="submit" isLoading={update.isPending} disabled={unchanged}>
          {m.save}
        </Button>
      </CardFooter>
    </form>
  );
}
