import { Injectable } from '@nestjs/common';
import { CacheNamespace, CacheService } from '../../infrastructure/cache/cache.service.js';
import {
  StorefrontRevalidationService,
  StorefrontTags,
} from '../../infrastructure/revalidation/storefront-revalidation.service.js';

/** Stock moved: refresh cached stock badges in the API and on the storefront. Best effort. */
@Injectable()
export class StockChangeNotifier {
  constructor(
    private readonly cache: CacheService,
    private readonly revalidation: StorefrontRevalidationService,
  ) {}

  async stockChanged(productSlugs: string[]): Promise<void> {
    await Promise.all([
      this.cache.invalidateNamespace(CacheNamespace.product),
      this.cache.invalidateNamespace(CacheNamespace.search),
      this.cache.invalidateNamespace(CacheNamespace.homepage),
    ]);
    await this.revalidation.revalidate([
      StorefrontTags.catalog,
      StorefrontTags.homepage,
      ...productSlugs.map(StorefrontTags.product),
    ]);
  }
}
