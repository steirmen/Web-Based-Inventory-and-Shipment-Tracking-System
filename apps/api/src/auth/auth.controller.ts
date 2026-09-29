import type { AuthUser, AuthUserResponse } from '@app/shared';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { CurrentUser, Public } from './decorators.js';
import { LoginDto, RegisterDto } from './dto/auth.dto.js';
import { SessionCookieService } from './sessions/session-cookie.service.js';

const MINUTE_MS = 60_000;

/** Per client IP. In-memory: suitable for a single API instance only (see docs/authentication.md). */
export const AUTH_RATE_LIMITS = {
  login: { limit: 10, ttl: MINUTE_MS },
  register: { limit: 5, ttl: 15 * MINUTE_MS },
} as const;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookie: SessionCookieService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: AUTH_RATE_LIMITS.register })
  async register(
    @Body() body: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUserResponse> {
    const { user, session } = await this.auth.register(body);
    this.cookie.set(response, session.token, session.expiresAt);
    return { user };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: AUTH_RATE_LIMITS.login })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUserResponse> {
    const { user, session } = await this.auth.login(body);
    this.cookie.set(response, session.token, session.expiresAt);
    return { user };
  }

  /** Public so it succeeds (idempotently) even when the session is already gone. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(this.cookie.read(request));
    this.cookie.clear(response);
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@CurrentUser() user: AuthUser): AuthUserResponse {
    return { user };
  }
}
