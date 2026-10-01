import { Module } from '@nestjs/common';
import { AppearanceController } from './appearance.controller.js';
import { AppearanceService } from './appearance.service.js';

/** User-level personalization (Phase 7B): appearance and saved appearance profiles. */
@Module({
  controllers: [AppearanceController],
  providers: [AppearanceService],
})
export class AppearanceModule {}
