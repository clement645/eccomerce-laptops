import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import { Worker } from 'bullmq';
import { API_ENV } from '../config/env.js';
import { EMAIL_QUEUE, MailService, type MailMessage } from '../infrastructure/mail/mail.service.js';
import { RedisService } from '../infrastructure/redis/redis.service.js';
import { JobsStatusService } from './jobs-status.service.js';
import { bullConnection } from './redis-connection.js';

/** How long one blocking wait for new jobs lasts. Longer = fewer Redis commands when idle. */
const IDLE_WAIT_SECONDS = 30;
/** How often jobs left "active" by a crashed or killed process are put back in the queue. */
const STALLED_CHECK_MS = 5 * 60_000;
/** A sent email is remembered this long, so a retried job never sends it twice. */
const SENT_MARKER_SECONDS = 7 * 24 * 60 * 60;

/**
 * Delivers queued emails. Jobs live in Redis, so they survive restarts and Render's sleep: anything
 * waiting, delayed (retry backoff) or interrupted is picked up the next time a consumer runs.
 * BullMQ is at-least-once; the "sent" marker makes delivery effectively once.
 */
@Injectable()
export class EmailWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailWorker.name);
  private worker?: Worker<MailMessage>;

  constructor(
    private readonly mail: MailService,
    private readonly redis: RedisService,
    private readonly status: JobsStatusService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  onModuleInit(): void {
    if (this.env.MAIL_DELIVERY !== 'queue') return;
    this.worker = new Worker<MailMessage>(
      EMAIL_QUEUE,
      async (job) => {
        const marker = this.redis.key('mail-sent', job.id ?? 'unknown');
        if (await this.redis.client.exists(marker).catch(() => 0))
          return { skipped: 'already sent' };
        await this.mail.deliver(job.data);
        await this.redis.client.set(marker, '1', 'EX', SENT_MARKER_SECONDS).catch(() => undefined);
        return { to: job.data.to.replace(/^(.).*@/, '$1***@') };
      },
      {
        connection: bullConnection(this.env.REDIS_URL),
        prefix: `${this.env.REDIS_KEY_PREFIX}:queue`,
        // Small: Render Free has 0.1 CPU and 512 MB, and emails are few.
        concurrency: 2,
        drainDelay: IDLE_WAIT_SECONDS,
        stalledInterval: STALLED_CHECK_MS,
        maxStalledCount: 2,
        lockDuration: 60_000,
      },
    );
    this.worker.on('failed', (job, error) =>
      this.logger.warn(
        `Email "${job?.data.subject}" failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}): ${error.message}`,
      ),
    );
    this.worker.on('error', (error) => this.logger.warn(`Email consumer: ${error.message}`));
    this.status.emailConsumer = 'running';
    this.logger.log('Email consumer started');
  }

  /** Waits for emails being sent right now; queued ones stay in Redis for the next start. */
  async onModuleDestroy(): Promise<void> {
    this.status.emailConsumer = 'off';
    await this.worker?.close();
  }
}
