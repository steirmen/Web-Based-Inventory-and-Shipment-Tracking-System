import type { AuthUser } from '@app/shared';
import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.types.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Opts a route (or controller) out of the global `SessionAuthGuard`.
 * Every other route requires an authenticated session by default.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Injects the authenticated user. Only valid on routes protected by `SessionAuthGuard`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().auth?.user;
    if (!user) {
      throw new Error('@CurrentUser() used on a route without an authenticated session.');
    }
    return user;
  },
);
