import { Module } from '@nestjs/common';
import { BlogCoreModule } from '../modules/blog/blog-core.module.js';
import { EmailWorker } from './email.worker.js';
import { LegacyQueueCleanup } from './legacy-queue.cleanup.js';
import { MaintenanceScheduler } from './maintenance.scheduler.js';

/**
 * Everything that runs in the background: the email consumer (BullMQ, only when
 * MAIL_DELIVERY=queue) and the maintenance sweeps. Loaded by the API when BACKGROUND_JOBS=inline
 * and by the separate worker process otherwise. Needs PaymentsCoreModule, OrdersCoreModule,
 * MailModule and RedisModule from the host module.
 */
@Module({
  imports: [BlogCoreModule],
  providers: [MaintenanceScheduler, EmailWorker, LegacyQueueCleanup],
})
export class BackgroundJobsModule {}
