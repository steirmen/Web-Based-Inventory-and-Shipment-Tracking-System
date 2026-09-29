import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../../config/env.js';

/** Longest token we accept from a cookie (real tokens are 43 characters). */
const MAX_TOKEN_LENGTH = 256;

/**
 * Single source of truth for the session cookie. The cookie is:
 * - HttpOnly: unreadable by browser JavaScript.
 * - SameSite=Lax: not sent on cross-site POST/fetch requests (CSRF mitigation).
 * - Secure: configurable for local HTTP; enforced in production by env validation.
 * - Path=/ with Max-Age/Expires equal to the session's absolute expiry.
 */
@Injectable()
export class SessionCookieService {
  private readonly name: string;
  private readonly baseOptions: CookieOptions;

  constructor(config: ConfigService<Env, true>) {
    this.name = config.get('AUTH_COOKIE_NAME', { infer: true });
    this.baseOptions = {
      httpOnly: true,
      secure: config.get('AUTH_COOKIE_SECURE', { infer: true }),
      sameSite: 'lax',
      path: '/',
    };
  }

  set(response: Response, token: string, expiresAt: Date): void {
    response.cookie(this.name, token, {
      ...this.baseOptions,
      maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
    });
  }

  clear(response: Response): void {
    response.clearCookie(this.name, this.baseOptions);
  }

  read(request: Request): string | undefined {
    const value: unknown = request.cookies?.[this.name];
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_TOKEN_LENGTH
      ? value
      : undefined;
  }
}
