import { AUTH_LIMITS } from '@app/shared';
import { ApiError } from '@/api/http-client';
import type { Translation } from '@/i18n/define';
import type { common } from '@/i18n/messages/common';

/**
 * Client-side validation for the auth forms. It catches obvious mistakes
 * before submitting; the API remains the authority. Messages come from the
 * current language (`common.authValidation`).
 */

export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

type AuthMessages = Translation<typeof common.en>['authValidation'];
type ErrorMessages = Translation<typeof common.en>['errors'];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string, m: AuthMessages): string | undefined {
  const email = value.trim();
  if (!email) return m.emailRequired;
  if (email.length > AUTH_LIMITS.emailMaxLength || !EMAIL_PATTERN.test(email)) {
    return m.emailInvalid;
  }
  return undefined;
}

export interface LoginValues {
  email: string;
  password: string;
}

export function validateLogin(
  values: LoginValues,
  m: AuthMessages,
): FieldErrors<keyof LoginValues> {
  return {
    email: validateEmail(values.email, m),
    password: values.password ? undefined : m.passwordRequired,
  };
}

export interface RegisterValues {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export function validateRegister(
  values: RegisterValues,
  m: AuthMessages,
): FieldErrors<keyof RegisterValues> {
  const name = values.name.trim();
  // Passwords are checked exactly as typed — never trimmed.
  const { password } = values;

  return {
    name: !name
      ? m.nameRequired
      : name.length > AUTH_LIMITS.nameMaxLength
        ? m.nameTooLong
        : undefined,
    email: validateEmail(values.email, m),
    password:
      password.length < AUTH_LIMITS.passwordMinLength
        ? m.passwordTooShort
        : password.length > AUTH_LIMITS.passwordMaxLength
          ? m.passwordTooLong
          : undefined,
    confirmPassword: !values.confirmPassword
      ? m.confirmRequired
      : values.confirmPassword !== password
        ? m.mismatch
        : undefined,
  };
}

export function hasErrors(errors: FieldErrors<string>): boolean {
  return Object.values(errors).some(Boolean);
}

/**
 * Maps API validation details onto form fields that exist in the form. The
 * API's field messages are English; `errors.fieldError` shows them as-is in
 * English and a translated message otherwise.
 */
export function serverFieldErrors<Field extends string>(
  error: unknown,
  fields: readonly Field[],
  m: ErrorMessages,
): FieldErrors<Field> {
  if (!(error instanceof ApiError)) return {};

  const result: FieldErrors<Field> = {};
  for (const detail of error.details) {
    if ((fields as readonly string[]).includes(detail.field) && detail.messages[0]) {
      result[detail.field as Field] = m.fieldError({ message: detail.messages[0] });
    }
  }
  return result;
}

/** A user-facing message for an auth request failure that is not tied to one field. */
export function describeAuthError(error: unknown, m: AuthMessages): string {
  if (error instanceof ApiError) {
    if (error.isNetworkError) return m.network;
    switch (error.code) {
      case 'AUTH_INVALID_CREDENTIALS':
        return m.invalidCredentials;
      case 'RATE_LIMITED':
        return m.rateLimited;
      case 'VALIDATION_ERROR':
        return m.checkFields;
    }
  }
  return m.generic;
}
