import type { AuthUser } from '@app/shared';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../common/errors/app-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { LoginDto, RegisterDto } from './dto/auth.dto.js';
import { normalizeEmail } from './email.js';
import { PasswordService } from './password/password.service.js';
import { type IssuedSession, SessionsService } from './sessions/sessions.service.js';

/** The user columns that may leave the API. */
const AUTH_USER_SELECT = { id: true, name: true, email: true } as const;

export interface AuthResult {
  user: AuthUser;
  session: IssuedSession;
}

const invalidCredentials = () =>
  new AppException(
    HttpStatus.UNAUTHORIZED,
    'AUTH_INVALID_CREDENTIALS',
    'Invalid email or password.',
  );

const emailTaken = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'AUTH_EMAIL_TAKEN',
    'An account with this email address already exists.',
  );

/**
 * Registration, login, and logout. Never logs passwords, password hashes,
 * session tokens, or email addresses — only user ids.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionsService,
  ) {}

  async register(input: RegisterDto): Promise<AuthResult> {
    const email = normalizeEmail(input.email);

    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw emailTaken();
    }

    const passwordHash = await this.passwords.hashPassword(input.password);

    let user: AuthUser;
    try {
      user = await this.prisma.user.create({
        data: { name: input.name.trim(), email, passwordHash },
        select: AUTH_USER_SELECT,
      });
    } catch (error) {
      // Lost a race with a concurrent registration for the same email.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw emailTaken();
      }
      throw error;
    }

    const session = await this.sessions.create(user.id);
    this.logger.log(`User registered: ${user.id}`);
    return { user, session };
  }

  async login(input: LoginDto): Promise<AuthResult> {
    const record = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(input.email) },
      select: { ...AUTH_USER_SELECT, passwordHash: true },
    });

    // Same work and the same error whether the account is missing, has no
    // password yet, or the password is wrong.
    const passwordMatches = record?.passwordHash
      ? await this.passwords.verifyPassword(record.passwordHash, input.password)
      : await this.passwords.verifyAgainstDummy(input.password);

    if (!record || !passwordMatches) {
      throw invalidCredentials();
    }

    const { passwordHash: _omitted, ...user } = record;
    const session = await this.sessions.create(user.id);
    this.logger.log(`User signed in: ${user.id}`);
    return { user, session };
  }

  /** Safe to call without a token or with an already revoked one. */
  async logout(token: string | undefined): Promise<void> {
    if (token) {
      await this.sessions.revoke(token);
    }
  }
}
