import type { ApiErrorCode } from '@app/shared';
import { ApiError } from '@/api/http-client';

const GENERIC_MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  ORGANIZATION_NOT_FOUND: "Workspace not found or you don't have access to it.",
  ORGANIZATION_FORBIDDEN: "You don't have permission to perform this action.",
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
};

/**
 * A safe, user-facing message for any failed API call. The API's own messages
 * for 4xx responses are written for end users; anything else gets generic text.
 * Raw server details are never shown.
 */
export function apiErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Something went wrong. Please try again.';
  }
  if (error.isNetworkError) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  const generic = error.code ? GENERIC_MESSAGES[error.code] : undefined;
  if (generic) {
    return generic;
  }
  if (error.status === 403) {
    return "You don't have permission to perform this action.";
  }
  if (error.status !== null && error.status < 500) {
    return error.message;
  }
  return 'Something went wrong on our side. Please try again.';
}

export function hasErrorCode(error: unknown, code: ApiErrorCode): boolean {
  return error instanceof ApiError && error.code === code;
}
