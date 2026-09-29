import type { ApiErrorCode } from '@app/shared';
import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { AppException } from '../common/errors/app-exception.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { IS_PUBLIC_KEY } from './decorators.js';
import { SessionCookieService } from './sessions/session-cookie.service.js';
import { SessionsService } from './sessions/sessions.service.js';

const FAILURES: Record<'invalid' | 'expired' | 'revoked', [ApiErrorCode, string]> = {
  invalid: ['AUTH_UNAUTHENTICATED', 'Authentication required.'],
  expired: ['AUTH_SESSION_EXPIRED', 'Your session has expired. Please sign in again.'],
  revoked: ['AUTH_SESSION_REVOKED', 'Your session has ended. Please sign in again.'],
};

/**
 * Global authentication guard (registered as APP_GUARD): every route requires a
 * valid session unless marked `@Public()`.
 *
 * Reads the session cookie → hashes the token → loads the session → rejects it
 * if unknown, revoked, or expired → attaches `{ user, session }` to `request.auth`.
 * Authentication only: it answers "who is this?", not "what may they do?".
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
    private readonly cookie: SessionCookieService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const token = this.cookie.read(request);
    if (!token) {
      throw new AppException(HttpStatus.UNAUTHORIZED, ...FAILURES.invalid);
    }

    const result = await this.sessions.validate(token);
    if (result.status !== 'valid') {
      // The cookie is useless now; remove it from the browser.
      this.cookie.clear(http.getResponse<Response>());
      throw new AppException(HttpStatus.UNAUTHORIZED, ...FAILURES[result.status]);
    }

    request.auth = { user: result.user, session: result.session };
    return true;
  }
}
