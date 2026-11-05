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
import { bullConnection } from './redis-connection.js';

/** Delivers queued emails. Failed sends are retried by BullMQ with exponential backoff. */
@Injectable()
export class EmailWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailWorker.name);
  private worker?: Worker<MailMessage>;

  constructor(
    private readonly mail: MailService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<MailMessage>(
      EMAIL_QUEUE,
      async (job) => {
        await this.mail.deliver(job.data);
        return { to: job.data.to.replace(/^(.).*@/, '$1***@') };
      },
      {
        connection: bullConnection(this.env.REDIS_URL),
        prefix: `${this.env.REDIS_KEY_PREFIX}:queue`,
        concurrency: 5,
      },
    );
    this.worker.on('failed', (job, error) =>
      this.logger.warn(
        `Email "${job?.data.subject}" failed (attempt ${job?.attemptsMade}/${job?.opts.attempts}): ${error.message}`,
      ),
    );
    this.logger.log('Email worker started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
