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
import { apiErrorMessage } from '@/lib/api-errors';
import { pageTitle } from '@/lib/app-config';
import { formatDate } from '@/lib/format';
import { useCurrentOrganization } from '@/lib/organization-context';
import { validateOrganizationName } from '@/lib/organization-form';

export function OrganizationSettingsPage() {
  const { organization } = useCurrentOrganization();

  return (
    <div className="flex flex-col gap-8">
      <title>{pageTitle(`Settings · ${organization.name}`)}</title>
      <PageHeader title="Settings" description="Details of this workspace." />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Workspace details</CardTitle>
          <CardDescription>
            <Can
              permission="ORGANIZATION_UPDATE"
              fallback="Only owners and admins can change workspace settings."
            >
              The name is shown to everyone in the workspace.
            </Can>
          </CardDescription>
        </CardHeader>
        <Can permission="ORGANIZATION_UPDATE" fallback={<ReadOnlyName name={organization.name} />}>
          <RenameForm />
        </Can>
        <CardContent className="flex flex-col gap-4 border-t border-border pt-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="font-medium">Slug</dt>
              <dd className="font-mono text-[0.8125rem] break-all text-muted-foreground">
                {organization.slug}
              </dd>
              <dd className="text-xs text-subtle-foreground">The slug can&apos;t be changed.</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="font-medium">Created</dt>
              <dd className="text-muted-foreground">{formatDate(organization.createdAt)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function ReadOnlyName({ name }: { name: string }) {
  return (
    <CardContent>
      <p className="text-sm font-medium">Name</p>
      <p className="mt-1 text-sm text-muted-foreground">{name}</p>
    </CardContent>
  );
}

function RenameForm() {
  const { organization } = useCurrentOrganization();
  const update = useUpdateOrganization(organization.id);
  const [name, setName] = useState(organization.name);
  const [error, setError] = useState<string>();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (update.isPending) return;
    const validation = validateOrganizationName(name);
    setError(validation);
    if (validation) return;
    update.mutate(name.trim());
  };

  const unchanged = name.trim() === organization.name;

  return (
    <form noValidate onSubmit={onSubmit}>
      <CardContent className="flex flex-col gap-4">
        {update.isError && <Alert tone="danger">{apiErrorMessage(update.error)}</Alert>}
        {update.isSuccess && unchanged && <Alert tone="success">Workspace name saved.</Alert>}
        <FormField label="Name" error={error}>
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
          Save changes
        </Button>
      </CardFooter>
    </form>
  );
}
