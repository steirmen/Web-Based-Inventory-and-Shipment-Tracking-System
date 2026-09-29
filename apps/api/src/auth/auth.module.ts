import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password/password.service.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { SessionCookieService } from './sessions/session-cookie.service.js';
import { SessionsService } from './sessions/sessions.service.js';

@Module({
  // Limits are set per route in AuthController; this registers the in-memory storage.
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }])],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    SessionsService,
    SessionCookieService,
    // Secure by default: every route requires a session unless marked @Public().
    { provide: APP_GUARD, useClass: SessionAuthGuard },
  ],
})
export class AuthModule {}
