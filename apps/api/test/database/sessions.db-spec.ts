import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { prisma } from './support/database.js';
import { expectCheckViolation, expectUniqueViolation } from './support/db-errors.js';
import { createUser } from './support/factories.js';

const HOUR = 3_600_000;
const newTokenHash = () => createHash('sha256').update(randomBytes(32)).digest('hex');
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR);

describe('Session', () => {
  it('belongs to a user and defaults lastSeenAt / revokedAt', async () => {
    const user = await createUser();

    const session = await prisma.session.create({
      data: { userId: user.id, tokenHash: newTokenHash(), expiresAt: inHours(24) },
      include: { user: true },
    });

    expect(session.user.id).toBe(user.id);
    expect(session.revokedAt).toBeNull();
    expect(session.lastSeenAt).toBeInstanceOf(Date);

    const withSessions = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { sessions: true },
    });
    expect(withSessions.sessions.map((s) => s.id)).toEqual([session.id]);
  });

  it('rejects a duplicate token hash', async () => {
    const user = await createUser();
    const tokenHash = newTokenHash();
    await prisma.session.create({ data: { userId: user.id, tokenHash, expiresAt: inHours(1) } });

    await expectUniqueViolation(
      prisma.session.create({ data: { userId: user.id, tokenHash, expiresAt: inHours(1) } }),
      'sessions_token_hash_key',
    );
  });

  it.each([
    ['a raw base64url token', randomBytes(32).toString('base64url')],
    ['uppercase hex', newTokenHash().toUpperCase()],
  ])('rejects %s as token hash', async (_case, tokenHash) => {
    const user = await createUser();

    await expectCheckViolation(
      prisma.session.create({ data: { userId: user.id, tokenHash, expiresAt: inHours(1) } }),
      'sessions_token_hash_format_check',
    );
  });

  it('rejects an expiry that is not after creation', async () => {
    const user = await createUser();

    await expectCheckViolation(
      prisma.session.create({
        data: { userId: user.id, tokenHash: newTokenHash(), expiresAt: inHours(-1) },
      }),
      'sessions_expires_after_creation_check',
    );
  });

  it('distinguishes active, expired, and revoked sessions', async () => {
    const user = await createUser();
    const past = inHours(-48);
    const [active] = await Promise.all([
      prisma.session.create({
        data: { userId: user.id, tokenHash: newTokenHash(), expiresAt: inHours(1) },
      }),
      prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: newTokenHash(),
          createdAt: past,
          lastSeenAt: past,
          expiresAt: inHours(-1),
        },
      }),
      prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: newTokenHash(),
          expiresAt: inHours(1),
          revokedAt: new Date(),
        },
      }),
    ]);

    const now = new Date();
    const activeSessions = await prisma.session.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } },
    });
    const expiredCount = await prisma.session.count({ where: { expiresAt: { lte: now } } });

    expect(activeSessions.map((s) => s.id)).toEqual([active.id]);
    expect(expiredCount).toBe(1);
  });

  it('can be revoked', async () => {
    const user = await createUser();
    const session = await prisma.session.create({
      data: { userId: user.id, tokenHash: newTokenHash(), expiresAt: inHours(1) },
    });

    const revoked = await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    expect(revoked.revokedAt).toBeInstanceOf(Date);
  });

  it('is deleted together with its user', async () => {
    const user = await createUser();
    const other = await createUser();
    await prisma.session.createMany({
      data: [
        { userId: user.id, tokenHash: newTokenHash(), expiresAt: inHours(1) },
        { userId: user.id, tokenHash: newTokenHash(), expiresAt: inHours(1) },
        { userId: other.id, tokenHash: newTokenHash(), expiresAt: inHours(1) },
      ],
    });

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.session.count()).toBe(1);
  });
});
