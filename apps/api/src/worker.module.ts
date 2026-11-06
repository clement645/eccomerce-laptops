import { Module, type DynamicModule } from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/config.module.js';
import { CacheModule } from './infrastructure/cache/cache.module.js';
import { MailModule } from './infrastructure/mail/mail.module.js';
import { MediaModule } from './infrastructure/media/media.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { RedisModule } from './infrastructure/redis/redis.module.js';
import { RevalidationModule } from './infrastructure/revalidation/revalidation.module.js';
import { BackgroundJobsModule } from './jobs/background-jobs.module.js';
import { JobsStatusModule } from './jobs/jobs-status.module.js';
import { OrdersCoreModule } from './modules/orders/orders-core.module.js';
import { PaymentsCoreModule } from './modules/payments/payments-core.module.js';

/**
 * Optional separate background process (BACKGROUND_JOBS=external on the API): no HTTP server, only
 * the email consumer and maintenance sweeps. Not needed on Render Free, where the API runs them.
 */
@Module({})
export class WorkerModule {
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        AppConfigModule.forRoot(env),
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.LOG_LEVEL,
            ...(env.NODE_ENV === 'development'
              ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
              : {}),
          },
        }),
        PrismaModule,
        RedisModule,
        CacheModule,
        MediaModule,
        RevalidationModule,
        MailModule,
        OrdersCoreModule,
        PaymentsCoreModule,
        JobsStatusModule,
        BackgroundJobsModule,
      ],
    };
  }
}
