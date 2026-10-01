import type { AuthUser } from '@app/shared';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../database/prisma.service.js';
import { generateSecureToken, hashToken } from '../../common/security/secure-token.js';

const DAY_MS = 86_400_000;
/** `last_seen_at` is refreshed at most this often, to avoid a write on every request. */
const LAST_SEEN_UPDATE_INTERVAL_MS = 5 * 60_000;

/**
 * Ended sessions (expired or revoked) are kept this long — so a returning
 * browser still gets "your session has expired" instead of a generic 401 —
 * and then deleted.
 */
export const ENDED_SESSION_RETENTION_MS = DAY_MS;

/** The sweep over all users' ended sessions runs at most this often per API process. */
export const SESSION_SWEEP_INTERVAL_MS = 60 * 60_000;

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
  private lastSweepAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMs = config.get('AUTH_SESSION_TTL_DAYS', { infer: true }) * DAY_MS;
  }

  /**
   * Starts a session (sign-in, registration) and opportunistically removes
   * ended sessions: always the user's own, and at most hourly everyone's.
   * No background job is needed; a failed cleanup never blocks the sign-in.
   */
  async create(userId: string): Promise<IssuedSession> {
    const token = generateSecureToken();
    const expiresAt = new Date(Date.now() + this.ttlMs);

    await this.prisma.session.create({
      data: { userId, tokenHash: hashToken(token), expiresAt },
    });
    await this.removeEndedSessions(userId);

    return { token, expiresAt };
  }

  /**
   * Deletes sessions that ended (expired, or revoked by sign-out) more than
   * `ENDED_SESSION_RETENTION_MS` ago: the given user's every time, everyone's
   * at most once per `SESSION_SWEEP_INTERVAL_MS`. Active sessions are never
   * touched, so nobody is signed out by it. Returns the number removed.
   */
  async removeEndedSessions(userId?: string, now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - ENDED_SESSION_RETENTION_MS);
    const ended = { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] };
    let removed = 0;
    try {
      if (userId) {
        removed += (await this.prisma.session.deleteMany({ where: { userId, ...ended } })).count;
      }
      if (now.getTime() - this.lastSweepAt >= SESSION_SWEEP_INTERVAL_MS) {
        this.lastSweepAt = now.getTime();
        removed += (await this.prisma.session.deleteMany({ where: ended })).count;
      }
    } catch {
      // Best effort: retried on the next sign-in.
    }
    return removed;
  }

  async validate(token: string): Promise<SessionValidation> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
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
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
