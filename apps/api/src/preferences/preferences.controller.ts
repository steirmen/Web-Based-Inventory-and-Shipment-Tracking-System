import type { AuthUser, PreferencesResponse } from '@app/shared';
import { Body, Controller, Patch } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators.js';
import { UpdatePreferencesDto } from './dto/preferences.dto.js';
import { PreferencesService } from './preferences.service.js';

/**
 * The signed-in user's interface language (Phase 10.1). Requires a session
 * (global SessionAuthGuard) and acts on `@CurrentUser()` only. The current
 * value is part of `GET /auth/me` (`user.language`), so no read route is needed.
 */
@Controller('me/preferences')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Patch()
  update(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdatePreferencesDto,
  ): Promise<PreferencesResponse> {
    return this.preferences.update(user.id, body.language);
  }
}
