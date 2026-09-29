import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { hashPassword, verifyPassword } from './password-hashing.js';

/** The only place that hashes or verifies passwords. */
@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hashPassword(password: string): Promise<string> {
    return hashPassword(password);
  }

  verifyPassword(passwordHash: string, password: string): Promise<boolean> {
    return verifyPassword(passwordHash, password);
  }

  /**
   * Performs a full verification against a throwaway hash and returns false.
   * Used when the account does not exist (or has no password), so response
   * timing does not reveal whether an email is registered.
   */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= hashPassword(randomBytes(32).toString('base64url'));
    await verifyPassword(await this.dummyHash, password);
    return false;
  }
}
