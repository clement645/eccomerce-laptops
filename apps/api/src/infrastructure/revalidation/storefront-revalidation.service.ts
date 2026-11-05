import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import { API_ENV } from '../../config/env.js';

/** Next.js cache tags used by the storefront (see apps/storefront/src/lib/data.ts). */
export const StorefrontTags = {
  catalog: 'catalog',
  homepage: 'storefront-homepage',
  layout: 'storefront-layout',
  product: (slug: string) => `product:${slug}`,
  blog: 'blog',
  post: (slug: string) => `post:${slug}`,
} as const;

/**
 * Tells the storefront to refresh cached pages after data changes. Best effort: failures are logged,
 * never thrown, because the storefront caches also expire on their own.
 */
@Injectable()
export class StorefrontRevalidationService {
  private readonly logger = new Logger(StorefrontRevalidationService.name);
  private readonly url: string | undefined;
  private readonly secret: string | undefined;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.url = env.STOREFRONT_REVALIDATE_URL;
    this.secret = env.REVALIDATE_SECRET;
  }

  get enabled(): boolean {
    return Boolean(this.url && this.secret);
  }

  async revalidate(tags: string[]): Promise<boolean> {
    if (!this.url || !this.secret || tags.length === 0) return false;
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Revalidate-Secret': this.secret },
        body: JSON.stringify({ tags: [...new Set(tags)] }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        this.logger.warn(`Storefront revalidation returned ${response.status}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn(`Storefront revalidation failed: ${(error as Error).message}`);
      return false;
    }
  }
}
