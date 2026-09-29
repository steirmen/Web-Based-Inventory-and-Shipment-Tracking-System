import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with Argon2id and a random salt', async () => {
    const [first, second] = await Promise.all([
      service.hashPassword('correct horse battery staple'),
      service.hashPassword('correct horse battery staple'),
    ]);

    expect(first).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain('correct horse');
  });

  it('verifies the exact password only (no trimming or case folding)', async () => {
    const hash = await service.hashPassword(' Secret password 1 ');

    await expect(service.verifyPassword(hash, ' Secret password 1 ')).resolves.toBe(true);
    await expect(service.verifyPassword(hash, 'Secret password 1')).resolves.toBe(false);
    await expect(service.verifyPassword(hash, ' secret password 1 ')).resolves.toBe(false);
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    await expect(service.verifyPassword('not-a-hash', 'anything')).resolves.toBe(false);
  });

  it('dummy verification always fails', async () => {
    await expect(service.verifyAgainstDummy('any password')).resolves.toBe(false);
  });
});
