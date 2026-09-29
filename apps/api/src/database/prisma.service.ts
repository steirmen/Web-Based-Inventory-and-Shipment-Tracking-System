import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { buildDatabaseUrl } from '../config/database-url.js';
import type { Env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

function createAdapter(config: ConfigService<Env, true>): PrismaPg {
  return new PrismaPg({
    connectionString: buildDatabaseUrl({
      host: config.get('DB_HOST', { infer: true }),
      port: config.get('DB_PORT', { infer: true }),
      name: config.get('DB_NAME', { infer: true }),
      user: config.get('DB_USER', { infer: true }),
      password: config.get('DB_PASSWORD', { infer: true }),
    }),
    connectionTimeoutMillis: 5_000,
  });
}

/**
 * Application-wide Prisma client. It connects lazily on the first query, so the
 * API can start (and report a degraded health status) while the database is down.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super({ adapter: createAdapter(config) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
