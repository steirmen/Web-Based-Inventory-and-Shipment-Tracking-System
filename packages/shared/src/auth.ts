/** Input limits shared by API validation and client-side form validation. */
export const AUTH_LIMITS = {
  nameMaxLength: 200,
  emailMaxLength: 320,
  passwordMinLength: 12,
  passwordMaxLength: 128,
} as const;

/** The only user fields the API ever returns. Never includes the password hash. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

/** Response body of `POST /auth/register`, `POST /auth/login`, and `GET /auth/me`. */
export interface AuthUserResponse {
  user: AuthUser;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}
