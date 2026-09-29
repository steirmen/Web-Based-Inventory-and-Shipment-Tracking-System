import type { AuthUser } from '@app/shared';
import type { Request } from 'express';

/** Attached to the request by `SessionAuthGuard` for authenticated routes. */
export interface AuthContext {
  user: AuthUser;
  session: { id: string; expiresAt: Date };
}

export type AuthenticatedRequest = Request & { auth?: AuthContext };
