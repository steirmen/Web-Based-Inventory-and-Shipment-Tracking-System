import argon2 from 'argon2';

/**
 * Argon2id parameters: the OWASP Password Storage Cheat Sheet baseline
 * (19 MiB memory, 2 iterations, 1 lane). The parameters are stored inside each
 * hash (PHC string format), so they can be raised later without breaking
 * existing hashes.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Hashes a password exactly as entered (never trimmed or normalized). */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/** Constant-time verification. Returns false (never throws) for a malformed hash. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}
