import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { ApiExceptionFilter } from './common/errors/api-exception.filter.js';
import { createValidationException } from './common/errors/validation-exception.js';
import type { Env } from './config/env.js';

/**
 * Cross-cutting HTTP configuration. Shared by `main.ts` and the e2e tests so
 * tests exercise the same request pipeline as the running server.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.getHttpAdapter().getInstance().disable('x-powered-by');

  // Parses the session cookie into `request.cookies`.
  app.use(cookieParser());

  // Explicit origins only (env validation rejects "*"): required for credentialed requests.
  app.enableCors({
    origin: config.get('API_CORS_ORIGINS', { infer: true }),
    credentials: true,
  });

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
