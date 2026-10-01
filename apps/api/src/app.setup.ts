import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { ApiExceptionFilter } from './common/errors/api-exception.filter.js';
import { createValidationException } from './common/errors/validation-exception.js';
import { csrfOriginCheck, securityHeaders } from './common/security/http-security.js';
import type { Env } from './config/env.js';

/**
 * Cross-cutting HTTP configuration. Shared by `main.ts` and the e2e tests so
 * tests exercise the same request pipeline as the running server.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  const express = app.getHttpAdapter().getInstance();
  express.disable('x-powered-by');
  // Client IP (rate limits): the socket address unless a trusted proxy is configured.
  // Never "trust everyone" (env validation refuses it), so X-Forwarded-For can't be spoofed.
  express.set('trust proxy', config.get('API_TRUST_PROXY', { infer: true }));

  const origins = config.get('API_CORS_ORIGINS', { infer: true });

  app.use(securityHeaders(config.get('NODE_ENV', { infer: true }) === 'production'));

  // Explicit origins only (env validation rejects "*"), matched exactly. Unknown origins get
  // no CORS headers at all (not even Allow-Credentials), so browsers block their reads.
  const allowedOrigins = new Set(origins);
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow: string | false) => void,
    ) => callback(null, origin !== undefined && allowedOrigins.has(origin) ? origin : false),
    credentials: true,
  });

  // State-changing requests must come from an allowed origin (CSRF; see docs/security.md).
  app.use(csrfOriginCheck(origins));

  // Parses the session cookie into `request.cookies`.
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Never echo submitted values (e.g. passwords) back in validation errors.
      validationError: { target: false, value: false },
      exceptionFactory: createValidationException,
    }),
  );

  app.useGlobalFilters(new ApiExceptionFilter());

  app.enableShutdownHooks();
}
