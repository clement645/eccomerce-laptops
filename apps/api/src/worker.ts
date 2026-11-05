import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { loadApiEnv } from './config/env.js';
import { WorkerModule } from './worker.module.js';

if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile('.env');
  } catch {
    // No .env file; rely on the process environment.
  }
}

async function bootstrap(): Promise<void> {
  const env = loadApiEnv();
  const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(env), {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}

await bootstrap();
