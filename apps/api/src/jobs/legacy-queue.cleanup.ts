import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import { Queue } from 'bullmq';
import { API_ENV } from '../config/env.js';
import { RedisService } from '../infrastructure/redis/redis.service.js';
import { bullConnection } from './redis-connection.js';

/** The BullMQ queue that used to drive maintenance before it moved to in-process sweeps. */
export const LEGACY_MAINTENANCE_QUEUE = 'maintenance';
/** Not urgent: wait until startup (and its catch-up) is over, which matters on 0.1 CPU. */
const FIRST_TRY_MS = 60_000;
const TRIES = 3;

/**
 * Deletes the old maintenance queue and its repeating schedules from Redis, once. Left in place they
 * would sit in Redis forever (nothing consumes them now). One EXISTS per start when already clean.
 */
@Injectable()
export class LegacyQueueCleanup implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(LegacyQueueCleanup.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly redis: RedisService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  onApplicationBootstrap(): void {
    this.schedule(1);
  }

  onModuleDestroy(): void {
    clearTimeout(this.timer);
  }

  /** In the background: never delays startup, and a failure is harmless (tried again). */
  private schedule(attempt: number): void {
    this.timer = setTimeout(() => {
      this.run().catch((error: unknown) => {
        this.logger.warn(`Old maintenance queue not removed yet: ${(error as Error).message}`);
        if (attempt < TRIES) this.schedule(attempt + 1);
      });
    }, FIRST_TRY_MS * attempt);
    this.timer.unref();
  }

  async run(): Promise<boolean> {
    const prefix = `${this.env.REDIS_KEY_PREFIX}:queue`;
    const found = await this.redis.client.exists(`${prefix}:${LEGACY_MAINTENANCE_QUEUE}:meta`);
    const repeat = await this.redis.client.exists(`${prefix}:${LEGACY_MAINTENANCE_QUEUE}:repeat`);
    if (!found && !repeat) return false;
    const queue = new Queue(LEGACY_MAINTENANCE_QUEUE, {
      connection: bullConnection(this.env.REDIS_URL),
      prefix,
    });
    try {
      for (const scheduler of await queue.getJobSchedulers()) {
        if (scheduler.key) await queue.removeJobScheduler(scheduler.key);
      }
      await queue.obliterate({ force: true });
      this.logger.log('Removed the old maintenance queue from Redis');
      return true;
    } finally {
      await queue.close();
    }
  }
}
