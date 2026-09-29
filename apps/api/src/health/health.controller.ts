import type { HealthResponse } from '@app/shared';
import { Controller, Get, Header } from '@nestjs/common';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Liveness endpoint: responds 200 while the API is running. Dependencies are reported in `checks`. */
  @Get()
  @Header('Cache-Control', 'no-store')
  check(): Promise<HealthResponse> {
    return this.healthService.check();
  }
}
