import { createHash } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@repo/database';
import {
  discountPercent,
  stockStatusFor,
  type BrandDetail,
  type BrandSummary,
  type CategoryDetail,
  type CategorySummary,
  type DeliverySummary,
  type FacetOption,
  type ProductCard,
  type ProductDetail,
  type ProductFacets,
  type ProductListResponse,
  type ProductReviewSummary,
  type SearchSuggestions,
  type SitemapData,
} from '@repo/shared-types';
import type { ProductListQuery } from '@repo/validation';
import { sanitizeRichText } from '../../common/sanitize/rich-text.js';
import { CacheNamespace, CacheService } from '../../infrastructure/cache/cache.service.js';
import { MediaUrlService } from '../../infrastructure/media/media-url.service.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import {
  StorefrontRevalidationService,
  StorefrontTags,
} from '../../infrastructure/revalidation/storefront-revalidation.service.js';
import {
  productCardSelect,
  publishedProductWhere,
  toProductCard,
} from '../storefront/product-card.mapper.js';
import { PRODUCT_SEARCH_ENGINE, type ProductSearchEngine } from './search/product-search.js';

const MAX_SEARCH_MATCHES = 500;
const MAX_PURCHASE_QUANTITY = 10;
const RELATED_LIMIT = 4;
const REVIEWS_SHOWN = 10;
/** Spec facets in display order; anything else follows alphabetically. Brand/condition have their own facets. */
const SPEC_FACET_ORDER = [
  'Processor',
  'RAM',
  'Storage',
  'Graphics',
  'Screen Size',
  'Resolution',
  'Refresh Rate',
  'Operating System',
  'Capacity',
  'Wi-Fi Standard',
];
const SPEC_FACET_EXCLUDED = new Set(['Manufacturer', 'Condition']);

interface CategoryNode {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly media: MediaUrlService,
    private readonly revalidation: StorefrontRevalidationService,
    @Inject(PRODUCT_SEARCH_ENGINE) private readonly search: ProductSearchEngine,
  ) {}

  // ── Listing ────────────────────────────────────────────────────────────────

  list(query: ProductListQuery): Promise<ProductListResponse> {
    const key = createHash('sha256').update(JSON.stringify(query)).digest('base64url').slice(0, 32);
    return this.cache.getOrSet(CacheNamespace.search, `list:${key}`, () => this.loadList(query));
  }

  private async loadList(query: ProductListQuery): Promise<ProductListResponse> {
    const now = new Date();
    const scope: Prisma.ProductWhereInput[] = [publishedProductWhere(now)];

    let ranks: Map<string, number> | null = null;
    if (query.q) {
      const matches = await this.search.match(query.q, MAX_SEARCH_MATCHES);
      ranks = new Map(matches.map((m) => [m.productId, m.rank]));
      scope.push({ id: { in: [...ranks.keys()] } });
    }
    if (query.category) {
      const categoryIds = await this.categoryWithDescendants(query.category);
      if (!categoryIds)
        throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'Category not found' });
      scope.push({ categoryId: { in: categoryIds } });
    }

    const scopeWhere: Prisma.ProductWhereInput = { AND: scope };
    const where: Prisma.ProductWhereInput = { AND: [scopeWhere, ...this.filterConditions(query)] };
    const skip = (query.page - 1) * query.pageSize;

    let total: number;
    let pageIds: string[];
    if (query.sort === 'relevance' && ranks) {
      const matching = await this.prisma.client.product.findMany({ where, select: { id: true } });
      const ordered = matching
        .map((p) => p.id)
        .sort((a, b) => (ranks.get(b) ?? 0) - (ranks.get(a) ?? 0));
      total = ordered.length;
      pageIds = ordered.slice(skip, skip + query.pageSize);
    } else {
      const [count, rows] = await Promise.all([
        this.prisma.client.product.count({ where }),
        this.prisma.client.product.findMany({
          where,
          orderBy: orderByFor(query.sort),
          skip,
          take: query.pageSize,
          select: { id: true },
        }),
      ]);
      total = count;
      pageIds = rows.map((r) => r.id);
    }

    const [items, facets] = await Promise.all([
      this.cardsInOrder(pageIds, now),
      this.facets(scopeWhere),
    ]);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      facets,
    };
  }

  private filterConditions(query: ProductListQuery): Prisma.ProductWhereInput[] {
    const conditions: Prisma.ProductWhereInput[] = [];
    if (query.brand.length) conditions.push({ brand: { slug: { in: query.brand } } });
    if (query.condition.length) conditions.push({ condition: { in: query.condition } });
    if (query.minPrice !== undefined)
      conditions.push({ priceMinor: { gte: query.minPrice * 100 } });
    if (query.maxPrice !== undefined)
      conditions.push({ priceMinor: { lte: query.maxPrice * 100 } });
    if (query.inStock) conditions.push({ availableQuantity: { gt: 0 } });
    if (query.onSale) conditions.push({ compareAtPriceMinor: { not: null } });
    if (query.featured) conditions.push({ isFeatured: true });
    for (const [key, values] of Object.entries(query.specs)) {
      conditions.push({ specifications: { some: { key, value: { in: values } } } });
    }
    return conditions;
  }

  private async cardsInOrder(ids: string[], now: Date): Promise<ProductCard[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.client.product.findMany({
      where: { id: { in: ids } },
      select: productCardSelect,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids
      .map((id) => byId.get(id))
      .filter((row) => row !== undefined)
      .map((row) => toProductCard(row, this.media, now))
      .filter((card) => card !== null);
  }

  private async facets(scope: Prisma.ProductWhereInput): Promise<ProductFacets> {
    const [byCategory, byBrand, byCondition, price, inStockCount, onSaleCount, specRows] =
      await Promise.all([
        this.prisma.client.product.groupBy({
          by: ['categoryId'],
          where: scope,
          _count: { _all: true },
        }),
        this.prisma.client.product.groupBy({
          by: ['brandId'],
          where: scope,
          _count: { _all: true },
        }),
        this.prisma.client.product.groupBy({
          by: ['condition'],
          where: scope,
          _count: { _all: true },
        }),
        this.prisma.client.product.aggregate({
          where: scope,
          _min: { priceMinor: true },
          _max: { priceMinor: true },
        }),
        this.prisma.client.product.count({
          where: { AND: [scope, { availableQuantity: { gt: 0 } }] },
        }),
        this.prisma.client.product.count({
          where: { AND: [scope, { compareAtPriceMinor: { not: null } }] },
        }),
        this.prisma.client.productSpecification.groupBy({
          by: ['key', 'value'],
          where: { isFilterable: true, key: { notIn: [...SPEC_FACET_EXCLUDED] }, product: scope },
          _count: { _all: true },
        }),
      ]);

    const [categories, brands] = await Promise.all([
      this.prisma.client.category.findMany({
        where: { id: { in: byCategory.map((c) => c.categoryId) } },
        select: { id: true, slug: true, name: true },
      }),
      this.prisma.client.brand.findMany({
        where: { id: { in: byBrand.map((b) => b.brandId) } },
        select: { id: true, slug: true, name: true },
      }),
    ]);
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const brandById = new Map(brands.map((b) => [b.id, b]));

    const option = (value: string, label: string, count: number): FacetOption => ({
      value,
      label,
      count,
    });
    const byLabel = (a: FacetOption, b: FacetOption) => a.label.localeCompare(b.label);

    const specGroups = new Map<string, FacetOption[]>();
    for (const row of specRows) {
      const options = specGroups.get(row.key) ?? [];
      options.push(option(row.value, row.value, row._count._all));
      specGroups.set(row.key, options);
    }
    const specOrder = (key: string) => {
      const index = SPEC_FACET_ORDER.indexOf(key);
      return index === -1 ? SPEC_FACET_ORDER.length : index;
    };

    return {
      categories: byCategory
        .map((c) => {
          const category = categoryById.get(c.categoryId);
          return category ? option(category.slug, category.name, c._count._all) : null;
        })
        .filter((o) => o !== null)
        .sort(byLabel),
      brands: byBrand
        .map((b) => {
          const brand = brandById.get(b.brandId);
          return brand ? option(brand.slug, brand.name, b._count._all) : null;
        })
        .filter((o) => o !== null)
        .sort(byLabel),
      conditions: byCondition
        .map((c) =>
          option(c.condition, c.condition === 'NEW' ? 'New' : 'Refurbished', c._count._all),
        )
        .sort(byLabel),
      specs: [...specGroups.entries()]
        // A filter with a single option for every product narrows nothing.
        .filter(([, options]) => options.length > 1)
        .sort(([a], [b]) => specOrder(a) - specOrder(b) || a.localeCompare(b))
        .map(([key, options]) => ({
          key,
          options: options.sort((a, b) =>
            a.label.localeCompare(b.label, undefined, { numeric: true }),
          ),
        })),
      price:
        price._min.priceMinor !== null && price._max.priceMinor !== null
          ? { minMinor: price._min.priceMinor, maxMinor: price._max.priceMinor }
          : null,
      inStockCount,
      onSaleCount,
    };
  }

  // ── Product detail ─────────────────────────────────────────────────────────

  async getProduct(slug: string): Promise<ProductDetail> {
    const product = await this.cache.getOrSet(CacheNamespace.product, `slug:${slug}`, () =>
      this.loadProduct(slug),
    );
    if (!product)
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Product not found' });
    return product;
  }

  private async loadProduct(slug: string): Promise<ProductDetail | null> {
    const now = new Date();
    const product = await this.prisma.client.product.findFirst({
      where: { slug, ...publishedProductWhere(now) },
      include: {
        brand: { select: { slug: true, name: true, logoKey: true } },
        category: { select: { id: true, slug: true, name: true } },
        images: { orderBy: { sortOrder: 'asc' } },
        variants: {
          where: { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
          include: { inventory: true },
        },
        specifications: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!product) return null;

    const [breadcrumbs, reviews, delivery] = await Promise.all([
      this.categoryBreadcrumbs(product.category.id),
      this.reviewSummary(product.id),
      this.deliverySummary(),
    ]);

    const specGroups = new Map<string, { key: string; value: string }[]>();
    for (const spec of product.specifications) {
      const items = specGroups.get(spec.group) ?? [];
      items.push({ key: spec.key, value: spec.value });
      specGroups.set(spec.group, items);
    }

    const plainDescription = (product.description ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      brand: {
        slug: product.brand.slug,
        name: product.brand.name,
        logoUrl: this.media.publicUrl(product.brand.logoKey),
      },
      category: { slug: product.category.slug, name: product.category.name },
      breadcrumbs,
      condition: product.condition,
      shortDescription: product.shortDescription,
      descriptionHtml: sanitizeRichText(product.description),
      warranty: { months: product.warrantyMonths, text: product.warrantyText },
      images: product.images
        .map((image) => {
          const url = this.media.publicUrl(image.storageKey);
          return url
            ? {
                url,
                alt: image.alt,
                width: image.width,
                height: image.height,
                variantId: image.variantId,
              }
            : null;
        })
        .filter((image) => image !== null),
      variants: product.variants.map((variant) => {
        const available = Math.max(
          0,
          (variant.inventory?.onHand ?? 0) - (variant.inventory?.reserved ?? 0),
        );
        return {
          id: variant.id,
          sku: variant.sku,
          name: variant.name,
          priceMinor: variant.priceMinor,
          compareAtPriceMinor: variant.compareAtPriceMinor,
          discountPercent: variant.compareAtPriceMinor
            ? discountPercent(variant.compareAtPriceMinor, variant.priceMinor)
            : 0,
          attributes: (variant.attributes ?? {}) as Record<string, string>,
          stockStatus: stockStatusFor(available, variant.inventory?.lowStockThreshold ?? 5),
          maxQuantity: Math.min(available, MAX_PURCHASE_QUANTITY),
          isDefault: variant.isDefault,
        };
      }),
      specifications: [...specGroups.entries()].map(([group, items]) => ({ group, items })),
      reviews,
      delivery,
      seo: {
        title: product.seoTitle ?? `${product.name} Price in Kenya`,
        description: (product.seoDescription ?? product.shortDescription ?? plainDescription).slice(
          0,
          160,
        ),
      },
      publishedAt: product.publishedAt?.toISOString() ?? null,
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  private async reviewSummary(productId: string): Promise<ProductReviewSummary | null> {
    const where = { productId, status: 'APPROVED' as const };
    const [byRating, latest] = await Promise.all([
      this.prisma.client.productReview.groupBy({ by: ['rating'], where, _count: { _all: true } }),
      this.prisma.client.productReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: REVIEWS_SHOWN,
        include: { user: { select: { profile: { select: { firstName: true, lastName: true } } } } },
      }),
    ]);
    const count = byRating.reduce((sum, r) => sum + r._count._all, 0);
    if (count === 0) return null;
    const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    let total = 0;
    for (const row of byRating) {
      distribution[row.rating - 1] = row._count._all;
      total += row.rating * row._count._all;
    }
    return {
      average: Math.round((total / count) * 10) / 10,
      count,
      distribution,
      items: latest.map((review) => {
        const profile = review.user.profile;
        return {
          id: review.id,
          rating: review.rating,
          title: review.title,
          body: review.body,
          authorName: profile ? `${profile.firstName} ${profile.lastName.charAt(0)}.` : 'Customer',
          verifiedPurchase: review.orderItemId !== null,
          createdAt: review.createdAt.toISOString(),
        };
      }),
    };
  }

  private deliverySummary(): Promise<DeliverySummary | null> {
    return this.cache.getOrSet(CacheNamespace.settings, 'delivery-summary', async () => {
      const rates = await this.prisma.client.shippingRate.findMany({
        where: { isActive: true, shippingMethod: { isActive: true } },
        select: {
          county: true,
          priceMinor: true,
          freeAboveMinor: true,
          etaMinDays: true,
          etaMaxDays: true,
        },
      });
      if (rates.length === 0) return null;
      const freeAbove = rates.map((r) => r.freeAboveMinor).filter((v): v is number => v !== null);
      return {
        fromPriceMinor: Math.min(...rates.map((r) => r.priceMinor)),
        fastestDays: Math.min(...rates.map((r) => r.etaMinDays)),
        slowestDays: Math.max(...rates.map((r) => r.etaMaxDays)),
        freeAboveMinor: freeAbove.length ? Math.min(...freeAbove) : null,
        countiesServed: new Set(rates.map((r) => r.county)).size,
      };
    });
  }

  async getRelated(slug: string): Promise<ProductCard[]> {
    return this.cache.getOrSet(CacheNamespace.product, `related:${slug}`, async () => {
      const now = new Date();
      const product = await this.prisma.client.product.findFirst({
        where: { slug, ...publishedProductWhere(now) },
        select: { id: true, categoryId: true, brandId: true },
      });
      if (!product) return [];
      const base = { AND: [publishedProductWhere(now), { id: { not: product.id } }] };
      const order: Prisma.ProductOrderByWithRelationInput[] = [
        { availableQuantity: 'desc' },
        { salesCount: 'desc' },
        { publishedAt: 'desc' },
      ];
      const sameCategory = await this.prisma.client.product.findMany({
        where: { AND: [base, { categoryId: product.categoryId }] },
        orderBy: order,
        take: RELATED_LIMIT,
        select: productCardSelect,
      });
      const rows = [...sameCategory];
      if (rows.length < RELATED_LIMIT) {
        const sameBrand = await this.prisma.client.product.findMany({
          where: {
            AND: [base, { brandId: product.brandId }, { id: { notIn: rows.map((r) => r.id) } }],
          },
          orderBy: order,
          take: RELATED_LIMIT - rows.length,
          select: productCardSelect,
        });
        rows.push(...sameBrand);
      }
      return rows.map((row) => toProductCard(row, this.media, now)).filter((card) => card !== null);
    });
  }

  // ── Categories and brands ──────────────────────────────────────────────────

  private categoryNodes(): Promise<CategoryNode[]> {
    return this.cache.getOrSet(CacheNamespace.category, 'nodes', () =>
      this.prisma.client.category.findMany({
        where: { isVisible: true },
        select: { id: true, slug: true, name: true, parentId: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    );
  }

  /** The category and all of its visible descendants, or null if the slug is unknown. */
  private async categoryWithDescendants(slug: string): Promise<string[] | null> {
    const nodes = await this.categoryNodes();
    const root = nodes.find((n) => n.slug === slug);
    if (!root) return null;
    const ids = [root.id];
    for (let i = 0; i < ids.length; i++) {
      for (const node of nodes) if (node.parentId === ids[i]) ids.push(node.id);
    }
    return ids;
  }

  private async categoryBreadcrumbs(categoryId: string): Promise<{ slug: string; name: string }[]> {
    const nodes = await this.categoryNodes();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const trail: { slug: string; name: string }[] = [];
    let current = byId.get(categoryId);
    while (current && trail.length < 10) {
      trail.unshift({ slug: current.slug, name: current.name });
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return trail;
  }

  listCategories(): Promise<(CategorySummary & { parentSlug: string | null })[]> {
    return this.cache.getOrSet(CacheNamespace.category, 'list', async () => {
      const now = new Date();
      const rows = await this.prisma.client.category.findMany({
        where: { isVisible: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          parent: { select: { slug: true } },
          _count: { select: { products: { where: publishedProductWhere(now) } } },
        },
      });
      return rows.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        imageUrl: this.media.publicUrl(c.imageKey),
        productCount: c._count.products,
        parentSlug: c.parent?.slug ?? null,
      }));
    });
  }

  async getCategory(slug: string): Promise<CategoryDetail> {
    const detail = await this.cache.getOrSet(CacheNamespace.category, `slug:${slug}`, async () => {
      const category = await this.prisma.client.category.findFirst({
        where: { slug, isVisible: true },
      });
      if (!category) return null;
      const all = await this.listCategories();
      const summary = all.find((c) => c.slug === slug);
      if (!summary) return null;
      return {
        ...summary,
        seoTitle: category.seoTitle,
        seoDescription: category.seoDescription,
        breadcrumbs: await this.categoryBreadcrumbs(category.id),
        children: all.filter((c) => c.parentSlug === slug),
      } satisfies CategoryDetail;
    });
    if (!detail)
      throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'Category not found' });
    return detail;
  }

  listBrands(): Promise<BrandSummary[]> {
    return this.cache.getOrSet(CacheNamespace.brand, 'list', async () => {
      const now = new Date();
      const rows = await this.prisma.client.brand.findMany({
        where: { isVisible: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          slug: true,
          name: true,
          logoKey: true,
          _count: { select: { products: { where: publishedProductWhere(now) } } },
        },
      });
      return rows.map((b) => ({
        slug: b.slug,
        name: b.name,
        logoUrl: this.media.publicUrl(b.logoKey),
        productCount: b._count.products,
      }));
    });
  }

  async getBrand(slug: string): Promise<BrandDetail> {
    const detail = await this.cache.getOrSet(CacheNamespace.brand, `slug:${slug}`, async () => {
      const brand = await this.prisma.client.brand.findFirst({ where: { slug, isVisible: true } });
      if (!brand) return null;
      const summary = (await this.listBrands()).find((b) => b.slug === slug);
      return {
        slug: brand.slug,
        name: brand.name,
        logoUrl: this.media.publicUrl(brand.logoKey),
        productCount: summary?.productCount ?? 0,
        description: brand.description,
        website: brand.website,
      } satisfies BrandDetail;
    });
    if (!detail)
      throw new NotFoundException({ code: 'BRAND_NOT_FOUND', message: 'Brand not found' });
    return detail;
  }

  // ── Search suggestions and sitemap ─────────────────────────────────────────

  suggest(q: string): Promise<SearchSuggestions> {
    const normalized = q.trim().toLowerCase().replace(/\s+/g, ' ');
    return this.cache.getOrSet(CacheNamespace.search, `suggest:${normalized}`, async () => {
      const now = new Date();
      const [matches, categories, brands] = await Promise.all([
        this.search.match(normalized, 6),
        this.categoryNodes(),
        this.listBrands(),
      ]);
      const cards = await this.cardsInOrder(
        matches.map((m) => m.productId),
        now,
      );
      const contains = (name: string) => name.toLowerCase().includes(normalized);
      return {
        products: cards.map((card) => ({
          slug: card.slug,
          name: card.name,
          brand: card.brand.name,
          category: card.category.name,
          categorySlug: card.category.slug,
          priceMinor: card.priceMinor,
          imageUrl: card.image?.url ?? null,
        })),
        categories: categories
          .filter((c) => contains(c.name))
          .slice(0, 3)
          .map(({ slug, name }) => ({ slug, name })),
        brands: brands
          .filter((b) => contains(b.name) && b.productCount > 0)
          .slice(0, 3)
          .map(({ slug, name }) => ({ slug, name })),
      };
    });
  }

  sitemap(): Promise<SitemapData> {
    return this.cache.getOrSet(CacheNamespace.product, 'sitemap', async () => {
      const now = new Date();
      const [products, categories, brands, posts] = await Promise.all([
        this.prisma.client.product.findMany({
          where: publishedProductWhere(now),
          select: { slug: true, updatedAt: true },
          orderBy: { publishedAt: 'desc' },
        }),
        this.prisma.client.category.findMany({
          where: { isVisible: true },
          select: { slug: true, updatedAt: true },
        }),
        this.prisma.client.brand.findMany({
          where: { isVisible: true, products: { some: publishedProductWhere(now) } },
          select: { slug: true, updatedAt: true },
        }),
        this.prisma.client.blogPost.findMany({
          where: { status: 'PUBLISHED', publishedAt: { lte: now } },
          select: { slug: true, updatedAt: true },
          orderBy: { publishedAt: 'desc' },
        }),
      ]);
      const iso = <T extends { updatedAt: Date }>(rows: T[]) =>
        rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
      return {
        products: iso(products),
        categories: iso(categories),
        brands: iso(brands),
        posts: iso(posts),
      };
    });
  }

  // ── Invalidation ───────────────────────────────────────────────────────────

  /**
   * Call after any catalog change (products, variants, prices, stock levels shown, categories, brands).
   * Clears API caches and asks the storefront to refresh its cached pages.
   */
  async invalidate(productSlugs: string[] = []): Promise<void> {
    await Promise.all([
      this.cache.invalidateNamespace(CacheNamespace.product),
      this.cache.invalidateNamespace(CacheNamespace.search),
      this.cache.invalidateNamespace(CacheNamespace.category),
      this.cache.invalidateNamespace(CacheNamespace.brand),
      this.cache.invalidateNamespace(CacheNamespace.homepage),
    ]);
    await this.revalidation.revalidate([
      StorefrontTags.catalog,
      StorefrontTags.homepage,
      StorefrontTags.layout,
      ...productSlugs.map(StorefrontTags.product),
    ]);
  }
}

function orderByFor(sort: ProductListQuery['sort']): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'price_asc':
      return [{ priceMinor: 'asc' }, { id: 'asc' }];
    case 'price_desc':
      return [{ priceMinor: 'desc' }, { id: 'asc' }];
    case 'popular':
      return [{ salesCount: 'desc' }, { availableQuantity: 'desc' }, { publishedAt: 'desc' }];
    case 'rating':
      return [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { publishedAt: 'desc' }];
    case 'newest':
    default:
      return [{ publishedAt: 'desc' }, { id: 'desc' }];
  }
}
