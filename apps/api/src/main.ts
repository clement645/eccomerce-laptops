import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { loadApiEnv } from './config/env.js';
import { API_PREFIX, setupApp } from './setup-app.js';

// Local development convenience: load apps/api/.env if present. Hosts inject real env vars.
if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile('.env');
  } catch {
    // No .env file; rely on the process environment.
  }
}

async function bootstrap(): Promise<void> {
  const env = loadApiEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));
  setupApp(app, env);

  await app.listen(env.PORT, '0.0.0.0');
  app.get(Logger).log(`API listening on ${env.API_PUBLIC_URL}/${API_PREFIX}`);
}

await bootstrap();
