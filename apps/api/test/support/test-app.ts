import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { setupApp } from '../../src/setup-app.js';
import { testEnv } from './test-env.js';

export async function createTestApp(
  envOverrides: Record<string, string> = {},
  /** e.g. swap a payment gateway for a fake: (b) => b.overrideProvider(TOKEN).useValue(fake) */
  configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<NestExpressApplication> {
  const env = testEnv(envOverrides);
  const moduleRef = await configure(
    Test.createTestingModule({ imports: [AppModule.forRoot(env)] }),
  ).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  setupApp(app, env);
  await app.init();
  return app;
}
