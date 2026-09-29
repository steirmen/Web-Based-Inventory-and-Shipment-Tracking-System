/**
 * Canonical form of an email address: trimmed and lowercased. The `users` table
 * enforces this with a CHECK constraint, so every lookup and insert must use it.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
