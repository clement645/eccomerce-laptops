import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import { createHash } from 'node:crypto';
import { Queue } from 'bullmq';
import nodemailer, { type Transporter } from 'nodemailer';
import { API_ENV } from '../../config/env.js';
import { bullConnection } from '../../jobs/redis-connection.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** e.g. the customer's address on contact-form notifications. */
  replyTo?: string;
}

export const EMAIL_QUEUE = 'email';

/** Deterministic job id from recipient and content (emails with one-time links are never equal). */
export function emailJobId(message: MailMessage): string {
  return `mail-${createHash('sha256').update(`${message.to}\n${message.subject}\n${message.text}`).digest('hex').slice(0, 40)}`;
}
export const SEND_EMAIL = 'send-email';

/**
 * Transactional email. With MAIL_DELIVERY=queue (the default) `send` hands the message to the
 * worker, which delivers it over SMTP and retries failures with backoff, so a slow or flaky mail
 * server never delays a checkout. If the queue cannot be reached, the message is sent directly
 * rather than lost. The "memory" transport keeps messages in `outbox` for automated tests.
 */
@Injectable()
export class MailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null;
  private readonly from: string;
  private queue: Queue | null = null;
  /** Messages sent with the memory transport (tests only). */
  readonly outbox: MailMessage[] = [];

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {
    this.from = env.MAIL_FROM;
    this.transport =
      env.MAIL_TRANSPORT === 'memory'
        ? null
        : nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE,
            auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
          });
  }

  onModuleInit(): void {
    if (this.env.MAIL_DELIVERY !== 'queue') return;
    this.queue = new Queue(EMAIL_QUEUE, {
      // Fail fast when Redis is down, so the fallback sends once instead of a late duplicate.
      connection: {
        ...bullConnection(this.env.REDIS_URL),
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
      },
      prefix: `${this.env.REDIS_KEY_PREFIX}:queue`,
    });
    // Without this, an unreachable Redis would surface as an unhandled error event.
    this.queue.on('error', (error) => this.logger.warn(`Email queue: ${error.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }

  /** Queues (or sends) a message. Returns false only when it could not be handed off or sent. */
  async send(message: MailMessage): Promise<boolean> {
    if (this.queue) {
      try {
        await Promise.race([
          this.queue.add(SEND_EMAIL, message, {
            // Same recipient and content = same job: a repeated request can't queue it twice.
            jobId: emailJobId(message),
            attempts: 6,
            backoff: { type: 'exponential', delay: 10_000 },
            // Kept a day so the id keeps deduplicating, then removed to bound Redis memory.
            removeOnComplete: { age: 24 * 60 * 60, count: 1_000 },
            removeOnFail: { age: 7 * 24 * 60 * 60, count: 1_000 },
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('queue timeout')), 3_000)),
        ]);
        return true;
      } catch (error) {
        this.logger.warn(`Email queue unavailable (${(error as Error).message}); sending directly`);
      }
    }
    try {
      await this.deliver(message);
      return true;
    } catch (error) {
      this.logger.error(
        `Email "${message.subject}" could not be sent: ${(error as Error).message}`,
      );
      return false;
    }
  }

  /** Sends now. Throws on failure so the worker can retry. */
  async deliver(message: MailMessage): Promise<void> {
    if (!this.transport) {
      this.outbox.push(message);
      return;
    }
    await this.transport.sendMail({ from: this.from, ...message });
  }
}
