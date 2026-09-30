import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password/password.service.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { SessionCookieService } from './sessions/session-cookie.service.js';
import { SessionsService } from './sessions/sessions.service.js';

@Module({
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
