import { type AuthUser, isLanguage } from '@app/shared';

/** The user columns that may leave the API (never the password hash). */
export const AUTH_USER_SELECT = { id: true, name: true, email: true, language: true } as const;

interface AuthUserRecord {
  id: string;
  name: string;
  email: string;
  language: string | null;
}

/** `language` is constrained by `users_language_check`; anything else reads as "not chosen". */
export function toAuthUser(record: AuthUserRecord): AuthUser {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    language: isLanguage(record.language) ? record.language : null,
  };
}
