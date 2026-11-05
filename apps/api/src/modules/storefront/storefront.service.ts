import { Injectable } from '@nestjs/common';
import type { Prisma } from '@repo/database';
import type {
  BannerContent,
  BlogPostCard,
  BrandSummary,
  CategorySummary,
  HomepageSection,
  StoreStats,
  StorefrontHomepage,
  StorefrontLayout,
} from '@repo/shared-types';
import { CacheNamespace, CacheService } from '../../infrastructure/cache/cache.service.js';
import { MediaUrlService } from '../../infrastructure/media/media-url.service.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  productCardSelect,
  publishedProductWhere,
  toProductCard,
  type ProductCardRow,
} from './product-card.mapper.js';

interface SectionConfig {
  source?: 'best_sellers' | 'newest' | 'featured' | 'category' | 'on_sale' | 'curated';
  limit?: number;
  categorySlug?: string;
}

const DEFAULT_SECTION_LIMIT = 8;
const MAX_SECTION_LIMIT = 24;

@Injectable()
export class StorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly media: MediaUrlService,
    private readonly settings: SettingsService,
  ) {}

  getLayout(): Promise<StorefrontLayout> {
    return this.cache.getOrSet(CacheNamespace.homepage, 'layout', async () => {
      const now = new Date();
      const [settings, categories, brands] = await Promise.all([
        this.settings.getPublic(),
        this.loadCategories(now, { parentId: null }),
        this.loadBrands(now),
      ]);
      return { settings, categories, brands };
    });
  }

  getHomepage(): Promise<StorefrontHomepage> {
    return this.cache.getOrSet(CacheNamespace.homepage, 'home', async () => {
      const now = new Date();
      const [heroBanners, promoBanners, categories, sections, brands, testimonials, posts, stats] =
        await Promise.all([
          this.loadBanners('HERO', now),
          this.loadBanners('PROMO', now),
          this.loadCategories(now, { showOnHomepage: true }),
          this.loadSections(now),
          this.loadBrands(now),
          this.loadTestimonials(),
          this.loadPosts(now),
          this.loadStats(now),
        ]);
      return {
        heroBanners,
        promoBanners,
        categories,
        sections,
        brands,
        testimonials,
        posts,
        stats,
      };
    });
  }

  /** Call when products, categories, brands, banners or homepage content change. */
  invalidate(): Promise<void> {
    return this.cache.invalidateNamespace(CacheNamespace.homepage);
  }

  private async loadBanners(placement: 'HERO' | 'PROMO', now: Date): Promise<BannerContent[]> {
    const rows = await this.prisma.client.banner.findMany({
      where: {
        placement,
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((b) => {
      const imageUrl = this.media.publicUrl(b.imageKey);
      return {
        id: b.id,
        eyebrow: b.eyebrow,
        title: b.title,
        titleHighlight: b.titleHighlight,
        subtitle: b.subtitle,
        highlights: b.highlights,
        annotation: b.annotation,
        cta: b.ctaLabel && b.ctaHref ? { label: b.ctaLabel, href: b.ctaHref } : null,
        secondaryCta:
          b.secondaryCtaLabel && b.secondaryCtaHref
            ? { label: b.secondaryCtaLabel, href: b.secondaryCtaHref }
            : null,
        image: imageUrl
          ? {
              url: imageUrl,
              mobileUrl: this.media.publicUrl(b.mobileImageKey),
              alt: b.imageAlt ?? '',
            }
          : null,
        theme: b.theme,
      };
    });
  }

  private async loadCategories(
    now: Date,
    where: Prisma.CategoryWhereInput,
  ): Promise<CategorySummary[]> {
    const rows = await this.prisma.client.category.findMany({
      where: { isVisible: true, ...where },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        imageKey: true,
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
    }));
  }

  private async loadBrands(now: Date): Promise<BrandSummary[]> {
    const rows = await this.prisma.client.brand.findMany({
      where: { isVisible: true },
      orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
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
  }

  private async loadSections(now: Date): Promise<HomepageSection[]> {
    const sections = await this.prisma.client.homepageSection.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { items: { orderBy: { sortOrder: 'asc' }, select: { productId: true } } },
    });

    const loaded = await Promise.all(
      sections.map(async (section): Promise<HomepageSection> => {
        const config = (section.config ?? {}) as SectionConfig;
        const limit = Math.min(
          Math.max(config.limit ?? DEFAULT_SECTION_LIMIT, 1),
          MAX_SECTION_LIMIT,
        );
        const rows = await this.loadSectionProducts(
          config,
          limit,
          now,
          section.items.map((i) => i.productId),
        );
        const products = rows
          .map((row) => toProductCard(row, this.media, now))
          .filter((p) => p !== null);
        return {
          key: section.key,
          title: section.title,
          subtitle: section.subtitle,
          href: sectionHref(config),
          products,
        };
      }),
    );
    // Sections without products are hidden rather than padded with unrelated items.
    return loaded.filter((s) => s.products.length > 0);
  }

  private async loadSectionProducts(
    config: SectionConfig,
    limit: number,
    now: Date,
    curatedIds: string[],
  ): Promise<ProductCardRow[]> {
    const published = publishedProductWhere(now);
    const find = (
      where: Prisma.ProductWhereInput,
      orderBy: Prisma.ProductOrderByWithRelationInput[],
    ) =>
      this.prisma.client.product.findMany({
        where: { AND: [published, where] },
        orderBy,
        take: limit,
        select: productCardSelect,
      });

    switch (config.source) {
      case 'best_sellers':
        // Only products that have actually sold. With no sales yet, the section is hidden.
        return find({ salesCount: { gt: 0 } }, [{ salesCount: 'desc' }, { publishedAt: 'desc' }]);
      case 'newest':
        return find({}, [{ publishedAt: 'desc' }]);
      case 'featured':
        return find({ isFeatured: true }, [{ publishedAt: 'desc' }]);
      case 'category':
        if (!config.categorySlug) return [];
        return find({ category: { slug: config.categorySlug } }, [
          { isFeatured: 'desc' },
          { publishedAt: 'desc' },
        ]);
      case 'on_sale':
        return find(
          {
            variants: {
              some: { isDefault: true, isActive: true, compareAtPriceMinor: { not: null } },
            },
          },
          [{ publishedAt: 'desc' }],
        );
      case 'curated': {
        if (curatedIds.length === 0) return [];
        const rows = await find({ id: { in: curatedIds } }, []);
        const order = new Map(curatedIds.map((id, index) => [id, index]));
        return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      }
      default:
        return [];
    }
  }

  private async loadTestimonials() {
    const rows = await this.prisma.client.testimonial.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      take: 12,
    });
    return rows.map((t) => ({
      id: t.id,
      authorName: t.authorName,
      authorTitle: t.authorTitle,
      location: t.location,
      quote: t.quote,
      avatarUrl: this.media.publicUrl(t.avatarKey),
    }));
  }

  private async loadPosts(now: Date): Promise<BlogPostCard[]> {
    const rows = await this.prisma.client.blogPost.findMany({
      where: { status: 'PUBLISHED', publishedAt: { lte: now } },
      orderBy: { publishedAt: 'desc' },
      take: 3,
      select: {
        slug: true,
        title: true,
        excerpt: true,
        coverKey: true,
        coverAlt: true,
        publishedAt: true,
        readingMinutes: true,
        category: { select: { slug: true, name: true } },
      },
    });
    return rows.map((p) => ({
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      coverUrl: this.media.publicUrl(p.coverKey),
      coverAlt: p.coverAlt,
      category: p.category,
      publishedAt: (p.publishedAt ?? now).toISOString(),
      readingMinutes: p.readingMinutes,
    }));
  }

  private async loadStats(now: Date): Promise<StoreStats> {
    const published = publishedProductWhere(now);
    const [productCount, brandCount, counties, reviews] = await Promise.all([
      this.prisma.client.product.count({ where: published }),
      this.prisma.client.brand.count({ where: { isVisible: true, products: { some: published } } }),
      this.prisma.client.shippingRate.findMany({
        where: { isActive: true, shippingMethod: { isActive: true } },
        distinct: ['county'],
        select: { county: true },
      }),
      this.prisma.client.productReview.aggregate({
        where: { status: 'APPROVED' },
        _count: { _all: true },
        _avg: { rating: true },
      }),
    ]);
    const reviewCount = reviews._count._all;
    return {
      productCount,
      brandCount,
      countiesServed: counties.length,
      reviews:
        reviewCount > 0
          ? { count: reviewCount, average: Math.round((reviews._avg.rating ?? 0) * 10) / 10 }
          : null,
    };
  }
}

function sectionHref(config: SectionConfig): string | null {
  switch (config.source) {
    case 'best_sellers':
      return '/shop?sort=popular';
    case 'newest':
      return '/shop?sort=newest';
    case 'featured':
      return '/shop?featured=true';
    case 'category':
      return config.categorySlug ? `/category/${config.categorySlug}` : null;
    case 'on_sale':
      return '/deals';
    default:
      return null;
  }
}
