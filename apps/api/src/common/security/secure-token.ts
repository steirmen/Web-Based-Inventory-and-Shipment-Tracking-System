import { createHash, randomBytes } from 'node:crypto';

/** 256 bits from the OS CSPRNG. */
const TOKEN_BYTES = 32;

/**
 * A new opaque bearer token (43 base64url characters), used for session
 * cookies and invitation links. Only ever sent to the client — never
 * persisted or logged.
 */
export function generateSecureToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** Shape check before any lookup, so malformed input never reaches the database. */
export function isWellFormedToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

/**
 * SHA-256 of a token, as stored in `token_hash` columns. A fast hash is
 * appropriate here (unlike passwords): the token is 256 bits of randomness, so
 * it cannot be brute-forced, and a deterministic hash allows an indexed lookup.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
