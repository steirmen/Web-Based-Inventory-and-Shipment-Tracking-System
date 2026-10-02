import { ORGANIZATION_LIMITS } from '@app/shared';
import { Building2 } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useCreateOrganization, useOrganizations } from '@/hooks/use-organizations';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { workspace } from '@/i18n/messages/workspace';
import { hasErrorCode, useApiErrorMessage } from '@/lib/api-errors';
import { pageTitle } from '@/lib/app-config';
import { type FieldErrors, hasErrors, serverFieldErrors } from '@/lib/auth-form';
import { type OrganizationValues, slugify, validateOrganization } from '@/lib/organization-form';
import { paths } from '@/routes/paths';

const FIELDS = ['name', 'slug'] as const;

/** Create a workspace: first-run onboarding, and "create another workspace" later. */
export function OnboardingPage() {
  const navigate = useNavigate();
  const organizations = useOrganizations();
  const create = useCreateOrganization();
  const [values, setValues] = useState<OrganizationValues>({ name: '', slug: '' });
  const [slugEdited, setSlugEdited] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<keyof OrganizationValues>>({});
  const w = useMessages(workspace);
  const m = w.onboarding;
  const errorMessages = useMessages(common).errors;
  const errorMessage = useApiErrorMessage();

  const isFirstWorkspace = organizations.data?.organizations.length === 0;

  const onNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    const name = event.target.value;
    setValues((current) => ({ name, slug: slugEdited ? current.slug : slugify(name) }));
    setErrors((current) => ({
      ...current,
      name: undefined,
      ...(slugEdited ? {} : { slug: undefined }),
    }));
  };

  const onSlugChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSlugEdited(true);
    setValues((current) => ({ ...current, slug: event.target.value }));
    setErrors((current) => ({ ...current, slug: undefined }));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (create.isPending) return;

    const clientErrors = validateOrganization(values, w.validation);
    setErrors(clientErrors);
    if (hasErrors(clientErrors)) return;

    create.mutate(
      { name: values.name.trim(), slug: values.slug },
      {
        onSuccess: ({ organization }) => {
          void navigate(paths.organization(organization.id), { replace: true });
        },
        onError: (error) => {
          if (hasErrorCode(error, 'ORGANIZATION_SLUG_TAKEN')) {
            setErrors({ slug: m.slugTaken });
          } else {
            setErrors(serverFieldErrors(error, FIELDS, errorMessages));
          }
        },
      },
    );
  };

  const formError = create.isError && !hasErrors(errors) ? errorMessage(create.error) : null;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 py-2 sm:py-6">
      <title>{pageTitle(m.pageTitle)}</title>
      <Card className="shadow-raised">
        <CardHeader className="gap-1 pb-5">
          <div className="mb-3 flex size-10 items-center justify-center rounded-control bg-primary-soft text-primary-soft-foreground">
            <Building2 className="size-5" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            {isFirstWorkspace ? m.firstTitle : m.title}
          </h1>
          <CardDescription>{m.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
            {formError && <Alert tone="danger">{formError}</Alert>}

            <FormField label={m.name} error={errors.name}>
              {(control) => (
                <Input
                  {...control}
                  name="name"
                  autoComplete="organization"
                  maxLength={ORGANIZATION_LIMITS.nameMaxLength}
                  placeholder={m.namePlaceholder}
                  value={values.name}
                  onChange={onNameChange}
                />
              )}
            </FormField>

            <FormField label={m.slug} error={errors.slug} hint={m.slugHint}>
              {(control) => (
                <Input
                  {...control}
                  name="slug"
                  autoComplete="off"
                  spellCheck={false}
                  autoCapitalize="none"
                  maxLength={ORGANIZATION_LIMITS.slugMaxLength}
                  placeholder="acme-supplies"
                  className="font-mono text-[0.8125rem]"
                  value={values.slug}
                  onChange={onSlugChange}
                />
              )}
            </FormField>

            <Button type="submit" size="lg" className="mt-2 w-full" isLoading={create.isPending}>
              {create.isPending ? m.submitting : m.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
