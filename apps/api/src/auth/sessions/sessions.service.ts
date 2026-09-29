import type { AuthUser } from '@app/shared';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { generateSessionToken, hashSessionToken } from './session-token.js';

const DAY_MS = 86_400_000;
/** `last_seen_at` is refreshed at most this often, to avoid a write on every request. */
const LAST_SEEN_UPDATE_INTERVAL_MS = 5 * 60_000;

export interface IssuedSession {
  /** Raw token for the cookie. Never persisted or logged. */
  token: string;
  expiresAt: Date;
}

export type SessionValidation =
  | { status: 'valid'; user: AuthUser; session: { id: string; expiresAt: Date } }
  | { status: 'invalid' | 'expired' | 'revoked' };

@Injectable()
export class SessionsService {
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMs = config.get('AUTH_SESSION_TTL_DAYS', { infer: true }) * DAY_MS;
  }

  async create(userId: string): Promise<IssuedSession> {
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + this.ttlMs);

    await this.prisma.session.create({
      data: { userId, tokenHash: hashSessionToken(token), expiresAt },
    });

    return { token, expiresAt };
  }

  async validate(token: string): Promise<SessionValidation> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        lastSeenAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!session) {
      return { status: 'invalid' };
    }
    if (session.revokedAt) {
      return { status: 'revoked' };
    }

    const now = new Date();
    if (session.expiresAt <= now) {
      return { status: 'expired' };
    }

    if (now.getTime() - session.lastSeenAt.getTime() > LAST_SEEN_UPDATE_INTERVAL_MS) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    }

    return {
      status: 'valid',
      user: session.user,
      session: { id: session.id, expiresAt: session.expiresAt },
    };
  }

  /** Revokes the session for this token, if it exists and is still active. Idempotent. */
  async revoke(token: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash: hashSessionToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
