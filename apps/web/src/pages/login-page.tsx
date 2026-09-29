import { type ChangeEvent, type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { useLogin } from '@/hooks/use-auth';
import { appConfig, pageTitle } from '@/lib/app-config';
import {
  describeAuthError,
  type FieldErrors,
  hasErrors,
  type LoginValues,
  serverFieldErrors,
  validateLogin,
} from '@/lib/auth-form';
import { paths } from '@/routes/paths';

const FIELDS = ['email', 'password'] as const;

export function LoginPage() {
  const login = useLogin();
  const [values, setValues] = useState<LoginValues>({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors<keyof LoginValues>>({});

  const onChange = (field: keyof LoginValues) => (event: ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (login.isPending) return;

    const clientErrors = validateLogin(values);
    setErrors(clientErrors);
    if (hasErrors(clientErrors)) return;

    login.mutate(values, {
      onError: (error) => setErrors(serverFieldErrors(error, FIELDS)),
    });
  };

  const formError = login.isError && !hasErrors(errors) ? describeAuthError(login.error) : null;

  return (
    <Card className="shadow-raised">
      <title>{pageTitle('Sign in')}</title>
      <CardHeader className="gap-1 pb-5">
        <h1 className="text-xl font-semibold tracking-tight">Sign in to {appConfig.name}</h1>
        <CardDescription>Welcome back. Enter your details to continue.</CardDescription>
      </CardHeader>

      <CardContent>
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          {formError && <Alert tone="danger">{formError}</Alert>}

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

          <FormField label="Password" error={errors.password}>
            {(control) => (
              <PasswordInput
                {...control}
                name="password"
                autoComplete="current-password"
                value={values.password}
                onChange={onChange('password')}
              />
            )}
          </FormField>

          <Button type="submit" size="lg" className="mt-2 w-full" isLoading={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center">
        <span>
          Don&apos;t have an account?{' '}
          <Link
            to={paths.register}
            className="rounded-sm font-medium text-primary focus-ring hover:underline"
          >
            Create one
          </Link>
        </span>
      </CardFooter>
    </Card>
  );
}
