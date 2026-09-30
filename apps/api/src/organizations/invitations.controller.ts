import type { AcceptInvitationResponse, AuthUser, PublicInvitationResponse } from '@app/shared';
import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser, Public } from '../auth/decorators.js';
import { InvitationsService } from './invitations.service.js';

const MINUTE_MS = 60_000;

/**
 * Invitation links (/invitations/:token). The token is the bearer credential:
 * it is hashed before lookup and never logged.
 */
@Controller('invitations')
@UseGuards(ThrottlerGuard)
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  /** Public: the invite page is shown before the visitor signs in. */
  @Public()
  @Get(':token')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 30, ttl: MINUTE_MS } })
  get(@Param('token') token: string): Promise<PublicInvitationResponse> {
    return this.invitations.getByToken(token);
  }

  /** Requires a session whose email matches the invitation. */
  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: MINUTE_MS } })
  accept(
    @CurrentUser() user: AuthUser,
    @Param('token') token: string,
  ): Promise<AcceptInvitationResponse> {
    return this.invitations.accept(user, token);
  }
}
