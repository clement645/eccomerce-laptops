import { Injectable } from '@nestjs/common';
import { RedisService } from '../../infrastructure/redis/redis.service.js';

// Fixed window counter. Atomic: increment, set expiry on the first hit, return count and remaining TTL.
const CONSUME_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`;

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  /** Throws if Redis is unavailable; the guard decides whether to fail open or closed. */
  async consume(
    bucket: string,
    identifier: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const key = this.redis.key('ratelimit', bucket, identifier);
    const [count, ttlMs] = (await this.redis.client.eval(
      CONSUME_SCRIPT,
      1,
      key,
      windowSeconds * 1000,
    )) as [number, number];
    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetSeconds: Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : windowSeconds * 1000) / 1000)),
    };
  }
}
