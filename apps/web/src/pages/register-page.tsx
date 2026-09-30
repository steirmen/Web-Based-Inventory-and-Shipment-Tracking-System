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

    const clientErrors = validateRegister(values);
    setErrors(clientErrors);
    if (hasErrors(clientErrors)) return;

    const { confirmPassword: _confirm, ...input } = values;
    registration.mutate(input, {
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'AUTH_EMAIL_TAKEN') {
          setErrors({ email: 'An account with this email already exists.' });
        } else {
          setErrors(serverFieldErrors(error, SERVER_FIELDS));
        }
      },
    });
  };

  const formError =
    registration.isError && !hasErrors(errors) ? describeAuthError(registration.error) : null;

  return (
    <Card className="shadow-raised">
      <title>{pageTitle('Create account')}</title>
      <CardHeader className="gap-1 pb-5">
        <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
        <CardDescription>
          It only takes a minute. You can set up your workspace later.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          {formError && <Alert tone="danger">{formError}</Alert>}

          <FormField label="Name" error={errors.name}>
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

          <FormField label="Email" error={errors.email}>
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
            label="Password"
            error={errors.password}
            hint={`At least ${AUTH_LIMITS.passwordMinLength} characters.`}
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

          <FormField label="Confirm password" error={errors.confirmPassword}>
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
            {registration.isPending ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center">
        <span>
          Already have an account?{' '}
          <Link
            to={paths.login}
            state={location.state}
            className="rounded-sm font-medium text-primary focus-ring hover:underline"
          >
            Sign in
          </Link>
        </span>
      </CardFooter>
    </Card>
  );
}
