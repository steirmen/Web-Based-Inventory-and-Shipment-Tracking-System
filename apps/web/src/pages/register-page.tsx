import { AUTH_LIMITS } from '@app/shared';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ApiError } from '@/api/http-client';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { useRegister } from '@/hooks/use-auth';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';
import { pageTitle } from '@/lib/app-config';
import {
  describeAuthError,
  type FieldErrors,
  hasErrors,
  type RegisterValues,
  serverFieldErrors,
  validateRegister,
} from '@/lib/auth-form';
import { paths } from '@/routes/paths';

const SERVER_FIELDS = ['name', 'email', 'password'] as const;

export function RegisterPage() {
  const registration = useRegister();
  const location = useLocation();
  const m = useMessages(common);
  const prefillEmail = (location.state as { email?: unknown } | null)?.email;
  const [values, setValues] = useState<RegisterValues>({
    name: '',
    email: typeof prefillEmail === 'string' ? prefillEmail : '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<FieldErrors<keyof RegisterValues>>({});

  const onChange = (field: keyof RegisterValues) => (event: ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (registration.isPending) return;

    const clientErrors = validateRegister(values, m.authValidation);
    setErrors(clientErrors);
    if (hasErrors(clientErrors)) return;

    const { confirmPassword: _confirm, ...input } = values;
    registration.mutate(input, {
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'AUTH_EMAIL_TAKEN') {
          setErrors({ email: m.register.emailTaken });
        } else {
          setErrors(serverFieldErrors(error, SERVER_FIELDS, m.errors));
        }
      },
    });
  };

  const formError =
    registration.isError && !hasErrors(errors)
      ? describeAuthError(registration.error, m.authValidation)
      : null;

  return (
    <Card className="shadow-raised">
      <title>{pageTitle(m.register.pageTitle)}</title>
      <CardHeader className="gap-1 pb-5">
        <h1 className="text-xl font-semibold tracking-tight">{m.register.title}</h1>
        <CardDescription>{m.register.description}</CardDescription>
      </CardHeader>

      <CardContent>
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          {formError && <Alert tone="danger">{formError}</Alert>}

          <FormField label={m.register.name} error={errors.name}>
            {(control) => (
              <Input
                {...control}
                name="name"
                autoComplete="name"
                maxLength={AUTH_LIMITS.nameMaxLength}
                value={values.name}
                onChange={onChange('name')}
              />
            )}
          </FormField>

          <FormField label={m.register.email} error={errors.email}>
            {(control) => (
              <Input
                {...control}
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                value={values.email}
                onChange={onChange('email')}
              />
            )}
          </FormField>

          <FormField
            label={m.register.password}
            error={errors.password}
            hint={m.register.passwordHint}
          >
            {(control) => (
              <PasswordInput
                {...control}
                name="password"
                autoComplete="new-password"
                value={values.password}
                onChange={onChange('password')}
              />
            )}
          </FormField>

          <FormField label={m.register.confirmPassword} error={errors.confirmPassword}>
            {(control) => (
              <PasswordInput
                {...control}
                name="confirmPassword"
                autoComplete="new-password"
                value={values.confirmPassword}
                onChange={onChange('confirmPassword')}
              />
            )}
          </FormField>

          <Button
            type="submit"
            size="lg"
            className="mt-2 w-full"
            isLoading={registration.isPending}
          >
            {registration.isPending ? m.register.submitting : m.register.submit}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center">
        <span>
          {m.register.haveAccount}{' '}
          <Link
            to={paths.login}
            state={location.state}
            className="rounded-sm font-medium text-primary focus-ring hover:underline"
          >
            {m.register.signIn}
          </Link>
        </span>
      </CardFooter>
    </Card>
  );
}
