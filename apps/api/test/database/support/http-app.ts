import type { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Response } from 'supertest';
import { AppModule } from '../../../src/app.module.js';
import { configureApp } from '../../../src/app.setup.js';
import { PrismaService } from '../../../src/database/prisma.service.js';
import { prisma } from './database.js';

/** Records every log line the application writes, so tests can assert what is (not) logged. */
export class CapturingLogger implements LoggerService {
  readonly lines: string[] = [];

  private record(...parts: unknown[]): void {
    this.lines.push(
      parts.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' '),
    );
  }

  log = (...parts: unknown[]) => this.record(...parts);
  error = (...parts: unknown[]) => this.record(...parts);
  warn = (...parts: unknown[]) => this.record(...parts);
  debug = (...parts: unknown[]) => this.record(...parts);
  verbose = (...parts: unknown[]) => this.record(...parts);
  fatal = (...parts: unknown[]) => this.record(...parts);
}

/** The real application (same HTTP pipeline as main.ts), backed by the test database. */
export async function createHttpApp(): Promise<{ app: INestApplication; logger: CapturingLogger }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const logger = new CapturingLogger();
  const app = moduleRef.createNestApplication({ logger });
  configureApp(app);
  await app.init();
  return { app, logger };
}

export interface ParsedCookie {
  name: string;
  value: string;
  attributes: Record<string, string | true>;
}

/** Parses the `Set-Cookie` header for one cookie name. */
export function getSetCookie(response: Response, name: string): ParsedCookie | undefined {
  const header = response.headers['set-cookie'] as unknown as string[] | undefined;
  const raw = header?.find((cookie) => cookie.startsWith(`${name}=`));
  if (!raw) {
    return undefined;
  }

  const [pair, ...attributeParts] = raw.split(';').map((part) => part.trim());
  const attributes: Record<string, string | true> = {};
  for (const part of attributeParts) {
    const [key, ...rest] = part.split('=');
    attributes[key.toLowerCase()] = rest.length > 0 ? rest.join('=') : true;
  }

  return { name, value: decodeURIComponent(pair.slice(name.length + 1)), attributes };
}
