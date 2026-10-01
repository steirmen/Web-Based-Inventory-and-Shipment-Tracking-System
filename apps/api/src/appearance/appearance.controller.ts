import type {
  AppearanceProfileListResponse,
  AppearanceProfileResponse,
  AppearanceResponse,
  AuthUser,
} from '@app/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators.js';
import { ResourceIdPipe } from '../common/validation/uuid.js';
import { appearanceProfileNotFound } from './appearance-errors.js';
import { AppearanceService } from './appearance.service.js';
import {
  AppearanceConfigDto,
  CreateAppearanceProfileDto,
  UpdateAppearanceProfileDto,
} from './dto/appearance.dto.js';

const profileId = () => new ResourceIdPipe(appearanceProfileNotFound);

/**
 * The signed-in user's appearance (Phase 7B). Requires a session (global
 * SessionAuthGuard); every route acts on `@CurrentUser()` only — there is no
 * user or organization id in any path or body. Not organization-scoped:
 * appearance is the same in every workspace.
 */
@Controller('me/appearance')
export class AppearanceController {
  constructor(private readonly appearance: AppearanceService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  get(@CurrentUser() user: AuthUser): Promise<AppearanceResponse> {
    return this.appearance.get(user.id);
  }

  @Put()
  update(
    @CurrentUser() user: AuthUser,
    @Body() body: AppearanceConfigDto,
  ): Promise<AppearanceResponse> {
    return this.appearance.update(user.id, body);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  reset(@CurrentUser() user: AuthUser): Promise<AppearanceResponse> {
    return this.appearance.reset(user.id);
  }

  @Get('profiles')
  @Header('Cache-Control', 'no-store')
  listProfiles(@CurrentUser() user: AuthUser): Promise<AppearanceProfileListResponse> {
    return this.appearance.listProfiles(user.id);
  }

  @Post('profiles')
  @HttpCode(HttpStatus.CREATED)
  createProfile(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateAppearanceProfileDto,
  ): Promise<AppearanceProfileResponse> {
    return this.appearance.createProfile(user.id, body);
  }

  @Patch('profiles/:profileId')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Param('profileId', profileId()) id: string,
    @Body() body: UpdateAppearanceProfileDto,
  ): Promise<AppearanceProfileResponse> {
    return this.appearance.updateProfile(user.id, id, body);
  }

  @Delete('profiles/:profileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteProfile(
    @CurrentUser() user: AuthUser,
    @Param('profileId', profileId()) id: string,
  ): Promise<void> {
    return this.appearance.deleteProfile(user.id, id);
  }

  @Post('profiles/:profileId/apply')
  @HttpCode(HttpStatus.OK)
  applyProfile(
    @CurrentUser() user: AuthUser,
    @Param('profileId', profileId()) id: string,
  ): Promise<AppearanceResponse> {
    return this.appearance.applyProfile(user.id, id);
  }
}
