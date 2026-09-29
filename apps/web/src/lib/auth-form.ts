import { AUTH_LIMITS } from '@app/shared';
import { ApiError } from '@/api/http-client';

/**
 * Client-side validation for the auth forms. It catches obvious mistakes
 * before submitting; the API remains the authority.
 */

export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return 'Enter your email address.';
  if (email.length > AUTH_LIMITS.emailMaxLength || !EMAIL_PATTERN.test(email)) {
    return 'Enter a valid email address.';
  }
  return undefined;
}

export interface LoginValues {
  email: string;
  password: string;
}

export function validateLogin(values: LoginValues): FieldErrors<keyof LoginValues> {
  return {
    email: validateEmail(values.email),
    password: values.password ? undefined : 'Enter your password.',
  };
}

export interface RegisterValues {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export function validateRegister(values: RegisterValues): FieldErrors<keyof RegisterValues> {
  const name = values.name.trim();
  // Passwords are checked exactly as typed — never trimmed.
  const { password } = values;

  return {
    name: !name
      ? 'Enter your name.'
      : name.length > AUTH_LIMITS.nameMaxLength
        ? `Use at most ${AUTH_LIMITS.nameMaxLength} characters.`
        : undefined,
    email: validateEmail(values.email),
    password:
      password.length < AUTH_LIMITS.passwordMinLength
        ? `Use at least ${AUTH_LIMITS.passwordMinLength} characters.`
        : password.length > AUTH_LIMITS.passwordMaxLength
          ? `Use at most ${AUTH_LIMITS.passwordMaxLength} characters.`
          : undefined,
    confirmPassword: !values.confirmPassword
      ? 'Confirm your password.'
      : values.confirmPassword !== password
        ? 'Passwords do not match.'
        : undefined,
  };
}

export function hasErrors(errors: FieldErrors<string>): boolean {
  return Object.values(errors).some(Boolean);
}

/** Maps API validation details onto form fields that exist in the form. */
export function serverFieldErrors<Field extends string>(
  error: unknown,
  fields: readonly Field[],
): FieldErrors<Field> {
  if (!(error instanceof ApiError)) return {};

  const result: FieldErrors<Field> = {};
  for (const detail of error.details) {
    if ((fields as readonly string[]).includes(detail.field)) {
      result[detail.field as Field] = detail.messages[0];
    }
  }
  return result;
}

/** A user-facing message for an auth request failure that is not tied to one field. */
export function describeAuthError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkError) {
      return "We couldn't reach the server. Check your connection and try again.";
    }
    switch (error.code) {
      case 'AUTH_INVALID_CREDENTIALS':
        return 'Incorrect email or password.';
      case 'RATE_LIMITED':
        return 'Too many attempts. Please wait a few minutes and try again.';
      case 'VALIDATION_ERROR':
        return 'Please check the highlighted fields.';
    }
  }
  return 'Something went wrong on our side. Please try again.';
}
