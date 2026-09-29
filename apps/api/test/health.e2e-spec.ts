import type { HealthResponse } from '@app/shared';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('GET /health', () => {
  let app: INestApplication;
  const prisma = { $queryRaw: vi.fn<() => Promise<unknown>>() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.resetAllMocks();
  });

  it('reports ok when the database is reachable', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const response = await request(app.getHttpServer()).get('/health').expect(200);
    const body = response.body as HealthResponse;

    expect(body.status).toBe('ok');
    expect(body.checks.database).toBe('up');
    expect(typeof body.uptime).toBe('number');
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('reports degraded (still 200) when the database is unreachable', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432'));

    const response = await request(app.getHttpServer()).get('/health').expect(200);
    const body = response.body as HealthResponse;

    expect(body.status).toBe('degraded');
    expect(body.checks.database).toBe('down');
  });

  it('allows the configured frontend origin via CORS', async () => {
    prisma.$queryRaw.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:5173')
      .expect('Access-Control-Allow-Origin', 'http://localhost:5173');
  });

  it('returns 404 for unknown routes', async () => {
    await request(app.getHttpServer()).get('/does-not-exist').expect(404);
  });
});
