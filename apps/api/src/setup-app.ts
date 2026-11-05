import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { ApiEnv } from '@repo/configuration';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

export const API_PREFIX = 'api/v1';

/** HTTP-level configuration shared by the real server and e2e tests. */
export function setupApp(app: NestExpressApplication, env: ApiEnv): INestApplication {
  app.disable('x-powered-by');
  if (env.NODE_ENV === 'production') {
    // One proxy hop (the hosting platform's load balancer) so req.ip is the client address.
    app.set('trust proxy', 1);
  }

  app.use(helmet());
  // Unsigned: refresh cookies are opaque random tokens validated against the database.
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '100kb' });
  app.useBodyParser('urlencoded', { limit: '100kb', extended: false });

  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      // Required on cookie-authenticated endpoints (CSRF defence, see CookieRequestGuard).
      'X-Requested-With',
      'Idempotency-Key',
      'X-Request-Id',
    ],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });

  app.setGlobalPrefix(API_PREFIX);

  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Electronics Commerce API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config), {
      jsonDocumentUrl: 'docs/openapi.json',
    });
  }

  app.enableShutdownHooks();
  return app;
}
