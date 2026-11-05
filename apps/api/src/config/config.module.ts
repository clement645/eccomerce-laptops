import { Global, Module, type DynamicModule } from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import { API_ENV } from './env.js';

@Global()
@Module({})
export class AppConfigModule {
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: AppConfigModule,
      providers: [{ provide: API_ENV, useValue: Object.freeze({ ...env }) }],
      exports: [API_ENV],
    };
  }
}
