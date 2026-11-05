import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@repo/database';
import type {
  AdminReview,
  Paginated,
  ProductReviewsPage,
  ReviewEligibility,
  ReviewSummary,
} from '@repo/shared-types';
import type {
  AdminReviewListQuery,
  ReviewInput,
  ReviewListQuery,
  ReviewModerationInput,
} from '@repo/validation';
import { CacheNamespace, CacheService } from '../../infrastructure/cache/cache.service.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { notFound } from '../admin/admin-errors.js';
import { StockChangeNotifier } from '../orders/stock-change.notifier.js';

const ORDER: Record<ReviewListQuery['sort'], Prisma.ProductReviewOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }],
  highest: [{ rating: 'desc' }, { createdAt: 'desc' }],
  lowest: [{ rating: 'asc' }, { createdAt: 'desc' }],
};

const adminInclude = {
  product: { select: { id: true, name: true, slug: true } },
  user: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
  moderatedBy: { select: { email: true } },
} satisfies Prisma.ProductReviewInclude;

/** "Wanjiru M." — never the full name or email. */
const displayName = (p: { firstName: string; lastName: string } | null | undefined) =>
  p ? `${p.firstName} ${p.lastName.charAt(0).toUpperCase()}.` : 'Customer';

/**
 * Product reviews. Only customers who received the product can review it, every review is
 * moderated before it appears, and ratings are derived from approved reviews only: nothing is
 * entered by hand.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly stock: StockChangeNotifier,
  ) {}

  async list(slug: string, query: ReviewListQuery): Promise<ProductReviewsPage> {
    return this.cache
      .getOrSet(
        CacheNamespace.reviews,
        `${slug}:${query.sort}:${query.page}:${query.pageSize}`,
        async () => {
          const product = await this.prisma.client.product.findFirst({
            where: { slug, status: 'PUBLISHED' },
            select: { id: true },
          });
          if (!product) return null;
          const where = { productId: product.id, status: 'APPROVED' as const };
          const [total, rows, groups] = await Promise.all([
            this.prisma.client.productReview.count({ where }),
            this.prisma.client.productReview.findMany({
              where,
              orderBy: ORDER[query.sort],
              skip: (query.page - 1) * query.pageSize,
              take: query.pageSize,
              include: {
                user: { select: { profile: { select: { firstName: true, lastName: true } } } },
              },
            }),
            this.prisma.client.productReview.groupBy({
              by: ['rating'],
              where,
              _count: { _all: true },
            }),
          ]);
          return {
            summary: summarize(groups.map((g) => ({ rating: g.rating, count: g._count._all }))),
            items: rows.map((r) => ({
              id: r.id,
              rating: r.rating,
              title: r.title,
              body: r.body,
              author: displayName(r.user.profile),
              verifiedPurchase: r.orderItemId !== null,
              createdAt: r.createdAt.toISOString(),
            })),
            page: query.page,
            pageSize: query.pageSize,
            total,
          };
        },
      )
      .then((page) => {
        if (!page) throw notFound('Product');
        return page;
      });
  }

  async eligibility(userId: string, slug: string): Promise<ReviewEligibility> {
    const product = await this.publishedProduct(slug);
    const [purchase, existing] = await Promise.all([
      this.deliveredItem(userId, product.id),
      this.prisma.client.productReview.findUnique({
        where: { userId_productId: { userId, productId: product.id } },
      }),
    ]);
    return {
      canReview: purchase !== null,
      reason: purchase ? null : 'NOT_PURCHASED',
      existing: existing
        ? {
            status: existing.status,
            rating: existing.rating,
            title: existing.title,
            body: existing.body,
          }
        : null,
    };
  }

  /** Creates or edits the customer's review. Either way it waits for moderation. */
  async submit(userId: string, slug: string, input: ReviewInput): Promise<ReviewEligibility> {
    const product = await this.publishedProduct(slug);
    const purchase = await this.deliveredItem(userId, product.id);
    if (!purchase)
      throw new ForbiddenException({
        code: 'NOT_PURCHASED',
        message: 'You can review products once your order has been delivered',
      });
    const content = { rating: input.rating, title: input.title, body: input.body };
    const existing = await this.prisma.client.productReview.findUnique({
      where: { userId_productId: { userId, productId: product.id } },
    });
    if (existing) {
      await this.prisma.client.productReview.update({
        where: { id: existing.id },
        data: {
          ...content,
          status: 'PENDING',
          moderatedAt: null,
          moderatedById: null,
          moderationNote: null,
        },
      });
      // An approved review that is being edited disappears until it is approved again.
      if (existing.status === 'APPROVED') await this.refreshRating(product.id, slug);
    } else {
      await this.prisma.client.productReview
        .create({ data: { ...content, productId: product.id, userId, orderItemId: purchase.id } })
        .catch(async (error: unknown) => {
          // Another tab created it a moment ago, or that purchase already has a review.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
            await this.prisma.client.productReview.create({
              data: { ...content, productId: product.id, userId },
            });
          else throw error;
        });
    }
    return this.eligibility(userId, slug);
  }

  async adminList(query: AdminReviewListQuery): Promise<Paginated<AdminReview>> {
    const where: Prisma.ProductReviewWhereInput = query.status ? { status: query.status } : {};
    const [total, rows] = await Promise.all([
      this.prisma.client.productReview.count({ where }),
      this.prisma.client.productReview.findMany({
        where,
        // Oldest first, so the moderation queue is handled in order.
        orderBy: { createdAt: query.status === 'PENDING' ? 'asc' : 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: adminInclude,
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        product: r.product,
        author: {
          name: r.user.profile
            ? `${r.user.profile.firstName} ${r.user.profile.lastName}`
            : r.user.email,
          email: r.user.email,
        },
        rating: r.rating,
        title: r.title,
        body: r.body,
        status: r.status,
        verifiedPurchase: r.orderItemId !== null,
        moderationNote: r.moderationNote,
        moderatedBy: r.moderatedBy?.email ?? null,
        moderatedAt: r.moderatedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async moderate(id: string, input: ReviewModerationInput, actorId: string): Promise<void> {
    const review = await this.prisma.client.productReview.findUnique({
      where: { id },
      include: { product: { select: { id: true, slug: true } } },
    });
    if (!review) throw notFound('Review');
    await this.prisma.client.productReview.update({
      where: { id },
      data: {
        status: input.status,
        moderatedById: actorId,
        moderatedAt: new Date(),
        moderationNote: input.note || null,
      },
    });
    await this.refreshRating(review.product.id, review.product.slug);
  }

  /** Recomputes the product's rating from approved reviews and refreshes cached pages. */
  private async refreshRating(productId: string, slug: string): Promise<void> {
    await this.prisma.client.$executeRaw(Prisma.sql`
      UPDATE products SET
        "ratingAvg" = COALESCE((SELECT ROUND(AVG(rating)::numeric, 2) FROM product_reviews
          WHERE "productId" = ${productId}::uuid AND status = 'APPROVED'), 0),
        "ratingCount" = (SELECT COUNT(*) FROM product_reviews WHERE "productId" = ${productId}::uuid AND status = 'APPROVED'),
        "updatedAt" = now()
      WHERE id = ${productId}::uuid`);
    await this.cache.invalidateNamespace(CacheNamespace.reviews);
    await this.stock.stockChanged([slug]);
  }

  private async publishedProduct(slug: string) {
    const product = await this.prisma.client.product.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!product) throw notFound('Product');
    return product;
  }

  /** A delivered purchase of this product by this customer (most recent first). */
  private deliveredItem(userId: string, productId: string) {
    return this.prisma.client.orderItem.findFirst({
      where: {
        productId,
        order: {
          userId,
          fulfillmentStatus: 'DELIVERED',
          paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] },
        },
      },
      orderBy: { order: { deliveredAt: 'desc' } },
      select: { id: true },
    });
  }
}

export function summarize(groups: { rating: number; count: number }[]): ReviewSummary {
  const count = groups.reduce((sum, g) => sum + g.count, 0);
  const total = groups.reduce((sum, g) => sum + g.rating * g.count, 0);
  return {
    average: count ? Math.round((total / count) * 10) / 10 : 0,
    count,
    distribution: [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: groups.find((g) => g.rating === stars)?.count ?? 0,
    })),
  };
}
