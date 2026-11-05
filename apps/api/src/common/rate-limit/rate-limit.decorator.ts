import { SetMetadata } from '@nestjs/common';

export interface RateLimitRule {
  /** Bucket name, e.g. "login". Requests to routes sharing a name share a budget. */
  name: string;
  limit: number;
  windowSeconds: number;
  /**
   * When Redis is unavailable: false (default) lets the request through; true rejects it with 503.
   * Use true where abuse is costly, such as login, password reset and payment initiation.
   */
  failClosed?: boolean;
}

export const RATE_LIMIT_METADATA = 'rate-limit:rules';
export const SKIP_RATE_LIMIT_METADATA = 'rate-limit:skip';

/** Apply stricter per-route limits in addition to the global baseline. */
export const RateLimit = (...rules: RateLimitRule[]) => SetMetadata(RATE_LIMIT_METADATA, rules);

/** Exempt a route (e.g. health checks polled by the hosting platform). */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_METADATA, true);
