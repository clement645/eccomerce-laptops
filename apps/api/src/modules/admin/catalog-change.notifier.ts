import { Injectable } from '@nestjs/common';
import { CacheNamespace, CacheService } from '../../infrastructure/cache/cache.service.js';
import {
  StorefrontRevalidationService,
  StorefrontTags,
} from '../../infrastructure/revalidation/storefront-revalidation.service.js';

/** Admin edits: clear API caches and refresh the storefront's cached pages. Best effort. */
@Injectable()
export class CatalogChangeNotifier {
  constructor(
    private readonly cache: CacheService,
    private readonly revalidation: StorefrontRevalidationService,
  ) {}

  /** Products changed (and possibly their slugs). */
  async productsChanged(slugs: (string | null | undefined)[]): Promise<void> {
    await this.bump(['product', 'search', 'homepage']);
    await this.revalidation.revalidate([
      StorefrontTags.catalog,
      StorefrontTags.homepage,
      ...slugs.filter((s): s is string => Boolean(s)).map(StorefrontTags.product),
    ]);
  }

  /** Categories or brands changed: navigation, listings and product pages all show them. */
  async taxonomyChanged(): Promise<void> {
    await this.bump(['category', 'brand', 'product', 'search', 'homepage']);
    await this.revalidation.revalidate([
      StorefrontTags.catalog,
      StorefrontTags.homepage,
      StorefrontTags.layout,
    ]);
  }

  async homepageChanged(): Promise<void> {
    await this.bump(['homepage']);
    await this.revalidation.revalidate([StorefrontTags.homepage]);
  }

  private async bump(names: (keyof typeof CacheNamespace)[]): Promise<void> {
    await Promise.all(names.map((n) => this.cache.invalidateNamespace(CacheNamespace[n])));
  }
}
