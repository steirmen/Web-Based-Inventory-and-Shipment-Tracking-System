import type { ApiErrorCode } from '@app/shared';
import { ApiError } from '@/api/http-client';
import type { Translation } from '@/i18n/define';
import { useMessages } from '@/i18n/i18n-context';
import { common } from '@/i18n/messages/common';

type ErrorMessages = Translation<typeof common.en>['errors'];

/** Codes whose generic text is clearer than the API's specific message. */
const GENERIC: readonly ApiErrorCode[] = [
  'ORGANIZATION_NOT_FOUND',
  'ORGANIZATION_FORBIDDEN',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
];

/**
 * A safe, user-facing message for any failed API call, in the interface
 * language. The API stays language-independent: it sends stable error codes,
 * translated here (in English its own user-facing message is shown, which
 * names the records involved). Raw server details are never shown, and 5xx
 * responses always get generic text.
 */
export function describeApiError(error: unknown, messages: ErrorMessages): string {
  if (!(error instanceof ApiError)) return messages.generic;
  if (error.isNetworkError) return messages.network;
  if (error.code && GENERIC.includes(error.code)) return messages.codes[error.code];
  if (error.status === 403) return messages.forbidden;
  if (error.status !== null && error.status < 500) {
    return messages.clientError({ message: error.message, code: error.code ?? null });
  }
  return messages.server;
}

/** `describeApiError` in the current language. */
export function useApiErrorMessage(): (error: unknown) => string {
  const messages = useMessages(common).errors;
  return (error) => describeApiError(error, messages);
}

export function hasErrorCode(error: unknown, code: ApiErrorCode): boolean {
  return error instanceof ApiError && error.code === code;
}
