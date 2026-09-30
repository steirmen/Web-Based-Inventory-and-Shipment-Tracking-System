/** Machine-readable error codes returned in every API error response. */
export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_UNAUTHENTICATED',
  'AUTH_SESSION_EXPIRED',
  'AUTH_SESSION_REVOKED',
  'AUTH_EMAIL_TAKEN',
  'ORGANIZATION_NOT_FOUND',
  'ORGANIZATION_SLUG_TAKEN',
  'ORGANIZATION_FORBIDDEN',
  'MEMBERSHIP_NOT_FOUND',
  'MEMBERSHIP_ALREADY_EXISTS',
  'MEMBER_ROLE_CHANGE_FORBIDDEN',
  'MEMBER_REMOVAL_FORBIDDEN',
  'OWNER_TRANSFER_REQUIRED',
  'INVITATION_NOT_FOUND',
  'INVITATION_EXPIRED',
  'INVITATION_REVOKED',
  'INVITATION_ALREADY_ACCEPTED',
  'INVITATION_ALREADY_PENDING',
  'INVITATION_EMAIL_MISMATCH',
  'INVITATION_ROLE_FORBIDDEN',
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
