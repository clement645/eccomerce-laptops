import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import { Queue, Worker } from 'bullmq';
import { API_ENV } from '../config/env.js';
import { OrderPaymentService } from '../modules/orders/order-payment.service.js';
import { BlogService } from '../modules/blog/blog.service.js';
import { MpesaPaymentService } from '../modules/payments/mpesa-payment.service.js';
import { bullConnection } from './redis-connection.js';

export const MAINTENANCE_QUEUE = 'maintenance';
export const RELEASE_EXPIRED = 'release-expired-reservations';
export const RECONCILE_MPESA = 'reconcile-mpesa-payments';
export const PUBLISH_SCHEDULED = 'publish-scheduled-posts';

/**
 * Recurring housekeeping. BullMQ's job scheduler runs each job once per interval even with several
 * worker instances, and retries on failure. Postgres stays authoritative: every job is idempotent.
 */
@Injectable()
export class MaintenanceWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceWorker.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    private readonly orders: OrderPaymentService,
    private readonly mpesa: MpesaPaymentService,
    private readonly blog: BlogService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async onModuleInit(): Promise<void> {
    const connection = bullConnection(this.env.REDIS_URL);
    const prefix = `${this.env.REDIS_KEY_PREFIX}:queue`;
    this.queue = new Queue(MAINTENANCE_QUEUE, { connection, prefix });
    await this.queue.upsertJobScheduler(
      RELEASE_EXPIRED,
      { every: 60_000 },
      { name: RELEASE_EXPIRED, opts: { removeOnComplete: 100, removeOnFail: 500 } },
    );
    await this.queue.upsertJobScheduler(
      PUBLISH_SCHEDULED,
      { every: 60_000 },
      { name: PUBLISH_SCHEDULED, opts: { removeOnComplete: 100, removeOnFail: 500 } },
    );
    if (this.mpesa.available) {
      // Checks M-Pesa prompts whose callback has not arrived (lost, delayed or never sent).
      await this.queue.upsertJobScheduler(
        RECONCILE_MPESA,
        { every: 20_000 },
        { name: RECONCILE_MPESA, opts: { removeOnComplete: 100, removeOnFail: 500 } },
      );
    } else {
      await this.queue.removeJobScheduler(RECONCILE_MPESA);
    }

    this.worker = new Worker(
      MAINTENANCE_QUEUE,
      async (job) => {
        if (job.name === RELEASE_EXPIRED) {
          const released = await this.orders.releaseExpired();
          if (released > 0) this.logger.log(`Released stock for ${released} unpaid order(s)`);
          return { released };
        }
        if (job.name === PUBLISH_SCHEDULED) {
          const published = await this.blog.publishDue();
          if (published > 0) this.logger.log(`Published ${published} scheduled post(s)`);
          return { published };
        }
        if (job.name === RECONCILE_MPESA) {
          const result = await this.mpesa.reconcileDue();
          if (result.settled > 0) this.logger.log(`Settled ${result.settled} M-Pesa payment(s)`);
          return result;
        }
        return null;
      },
      { connection, prefix, concurrency: 1 },
    );
    this.worker.on('failed', (job, error) =>
      this.logger.error(`Job ${job?.name} failed: ${error.message}`),
    );
    this.logger.log('Maintenance worker started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}
