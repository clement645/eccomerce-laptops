import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import { Redis } from 'ioredis';
import { API_ENV } from '../../config/env.js';

/**
 * Shared Redis connection for cache, rate limiting and short-lived state.
 *
 * Redis is never the source of truth, so the API starts and serves requests while Redis is down:
 * commands fail fast (no offline queue) and callers degrade gracefully, while the client keeps
 * reconnecting in the background. BullMQ (later phases) uses its own connections.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly client: Redis;
  readonly prefix: string;
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.prefix = env.REDIS_KEY_PREFIX;
    this.client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      commandTimeout: 2_000,
      retryStrategy: (attempt) => Math.min(attempt * 250, 5_000),
    });
    let reportedDown = false;
    this.client.on('error', (error: Error) => {
      if (!reportedDown) this.logger.warn(`Redis unavailable: ${error.message}`);
      reportedDown = true;
    });
    this.client.on('ready', () => {
      if (reportedDown) this.logger.log('Redis connection restored');
      reportedDown = false;
    });
  }

  /** Build a namespaced key: `${prefix}:${part1}:${part2}...` */
  key(...parts: (string | number)[]): string {
    return [this.prefix, ...parts].join(':');
  }

  get isReady(): boolean {
    return this.client.status === 'ready';
  }

  async ping(): Promise<void> {
    await this.client.ping();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      // Start anyway; the client retries in the background.
      this.logger.warn(`Starting without Redis: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'end') return;
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
