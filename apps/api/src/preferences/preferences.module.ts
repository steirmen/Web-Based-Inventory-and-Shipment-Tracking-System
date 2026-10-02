import { Module } from '@nestjs/common';
import { PreferencesController } from './preferences.controller.js';
import { PreferencesService } from './preferences.service.js';

/** User-level interface preferences (Phase 10.1): the interface language. */
@Module({
  controllers: [PreferencesController],
  providers: [PreferencesService],
})
export class PreferencesModule {}
