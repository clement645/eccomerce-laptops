import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service.js';

/** Cache namespaces and their default TTLs (seconds). See docs/ARCHITECTURE.md §7. */
export const CacheNamespace = {
  product: { name: 'product', ttl: 600 },
  category: { name: 'category', ttl: 3_600 },
  brand: { name: 'brand', ttl: 3_600 },
  homepage: { name: 'homepage', ttl: 300 },
  search: { name: 'search', ttl: 120 },
  settings: { name: 'settings', ttl: 300 },
  blog: { name: 'blog', ttl: 300 },
  reviews: { name: 'reviews', ttl: 300 },
} as const;
export type CacheNamespace = (typeof CacheNamespace)[keyof typeof CacheNamespace];

/**
 * Read-through JSON cache on Redis.
 *
 * - Keys: `{prefix}:{namespace}:v{version}:{id}`. Bumping a namespace's version invalidates every
 *   entry in it at once without scanning keys; orphaned entries simply expire.
 * - Fails open: if Redis is unavailable the loader runs and the result is returned uncached.
 * - Only cache plain JSON-shaped DTOs. Dates and Decimals come back as strings on a cache hit,
 *   so services must map Prisma models to DTOs before caching.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly redis: RedisService) {}

  async getOrSet<T>(
    namespace: CacheNamespace,
    id: string,
    loader: () => Promise<T>,
    ttlSeconds: number = namespace.ttl,
  ): Promise<T> {
    let key: string | null = null;
    try {
      key = await this.entryKey(namespace.name, id);
      const cached = await this.redis.client.get(key);
      if (cached !== null) return JSON.parse(cached) as T;
    } catch (error) {
      this.logFailure('read', error);
      return loader();
    }

    const value = await loader();
    if (value !== undefined) {
      try {
        await this.redis.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      } catch (error) {
        this.logFailure('write', error);
      }
    }
    return value;
  }

  /** Remove one entry. */
  async invalidate(namespace: CacheNamespace, id: string): Promise<void> {
    try {
      await this.redis.client.del(await this.entryKey(namespace.name, id));
    } catch (error) {
      this.logFailure('invalidate', error);
    }
  }

  /** Invalidate every entry in a namespace by bumping its version. */
  async invalidateNamespace(namespace: CacheNamespace): Promise<void> {
    try {
      await this.redis.client.incr(this.versionKey(namespace.name));
    } catch (error) {
      this.logFailure('invalidate namespace', error);
    }
  }

  private async entryKey(namespace: string, id: string): Promise<string> {
    const version = (await this.redis.client.get(this.versionKey(namespace))) ?? '0';
    return this.redis.key(namespace, `v${version}`, id);
  }

  private versionKey(namespace: string): string {
    return this.redis.key('cache-version', namespace);
  }

  private logFailure(operation: string, error: unknown): void {
    this.logger.warn(`Cache ${operation} skipped: ${(error as Error).message}`);
  }
}
