import { createHash, randomBytes } from 'node:crypto';

/** 256 bits from the OS CSPRNG. */
const SESSION_TOKEN_BYTES = 32;

/** A new opaque session token (43 base64url characters). Only ever sent to the browser. */
export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

/**
 * SHA-256 of the token, as stored in `sessions.token_hash`. A fast hash is
 * appropriate here (unlike passwords): the token is 256 bits of randomness, so
 * it cannot be brute-forced, and a deterministic hash allows an indexed lookup.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
