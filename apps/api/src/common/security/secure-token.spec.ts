import { describe, expect, it } from 'vitest';
import { generateSecureToken, hashToken, isWellFormedToken } from './secure-token.js';

describe('secure tokens', () => {
  it('generates unique 256-bit base64url tokens', () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateSecureToken));

    expect(tokens.size).toBe(1000);
    for (const token of tokens) {
      expect(isWellFormedToken(token)).toBe(true);
    }
  });

  it('rejects malformed tokens', () => {
    expect(isWellFormedToken('short')).toBe(false);
    expect(isWellFormedToken(`${'a'.repeat(42)}!`)).toBe(false);
    expect(isWellFormedToken('a'.repeat(44))).toBe(false);
  });

  it('hashes deterministically to 64 lowercase hex characters', () => {
    const token = generateSecureToken();

    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(hashToken(generateSecureToken()));
  });
});
