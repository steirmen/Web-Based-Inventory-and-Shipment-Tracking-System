/** Machine-readable error codes returned in every API error response. */
export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_UNAUTHENTICATED',
  'AUTH_SESSION_EXPIRED',
  'AUTH_SESSION_REVOKED',
  'AUTH_EMAIL_TAKEN',
  'RATE_LIMITED',
  'BAD_REQUEST',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** One invalid input field. `messages` never contain the submitted value. */
export interface ApiFieldError {
  field: string;
  messages: string[];
}

/** Body of every non-2xx API response. */
export interface ApiErrorBody {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  /** Present for VALIDATION_ERROR. */
  details?: ApiFieldError[];
}
