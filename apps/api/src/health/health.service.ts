import type { DependencyStatus, HealthResponse } from '@app/shared';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponse> {
    const database = await this.checkDatabase();

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      checks: { database },
    };
  }

  private async checkDatabase(): Promise<DependencyStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch (error) {
      this.logger.warn(`Database health check failed: ${describeError(error)}`);
      return 'down';
    }
  }
}

/** One-line error summary. Driver errors (e.g. ECONNREFUSED) carry the useful detail in `code`. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  const message = error.message.replace(/\s+/g, ' ').trim();
  return code ? `[${code}] ${message}` : message;
}
