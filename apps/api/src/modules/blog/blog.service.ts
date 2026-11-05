import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@repo/database';
import type {
  AdminBlogCategory,
  AdminBlogPost,
  BlogCategoryItem,
  BlogPostDetail,
  BlogPostSummary,
  Paginated,
} from '@repo/shared-types';
import type {
  AdminBlogListQuery,
  BlogCategoryInput,
  BlogListQuery,
  BlogPostInput,
  BlogPublishInput,
} from '@repo/validation';
import { sanitizeRichText } from '../../common/sanitize/rich-text.js';
import { CacheNamespace, CacheService } from '../../infrastructure/cache/cache.service.js';
import { MediaUrlService } from '../../infrastructure/media/media-url.service.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import {
  StorefrontRevalidationService,
  StorefrontTags,
} from '../../infrastructure/revalidation/storefront-revalidation.service.js';
import { mapWriteError, notFound } from '../admin/admin-errors.js';
import { assertUploaded } from '../admin/media/media-keys.js';
import { autoExcerpt, readingMinutes } from './blog-content.js';

const summarySelect = {
  slug: true,
  title: true,
  excerpt: true,
  coverKey: true,
  coverAlt: true,
  publishedAt: true,
  readingMinutes: true,
  category: { select: { slug: true, name: true } },
  author: { select: { profile: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.BlogPostSelect;
type SummaryRow = Prisma.BlogPostGetPayload<{ select: typeof summarySelect }>;

const adminInclude = {
  author: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.BlogPostInclude;
type AdminRow = Prisma.BlogPostGetPayload<{ include: typeof adminInclude }>;

/** Live on the storefront: published, and due (scheduled posts switch over at their time). */
const live = (now: Date): Prisma.BlogPostWhereInput => ({
  status: 'PUBLISHED',
  publishedAt: { lte: now },
});

@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUrlService,
    private readonly cache: CacheService,
    private readonly revalidation: StorefrontRevalidationService,
  ) {}

  // ── Public ─────────────────────────────────────────────────────────────────

  posts(query: BlogListQuery): Promise<Paginated<BlogPostSummary>> {
    return this.cache.getOrSet(
      CacheNamespace.blog,
      `list:${query.category ?? ''}:${query.page}:${query.pageSize}`,
      async () => {
        const where: Prisma.BlogPostWhereInput = {
          ...live(new Date()),
          ...(query.category ? { category: { slug: query.category } } : {}),
        };
        const [total, rows] = await Promise.all([
          this.prisma.client.blogPost.count({ where }),
          this.prisma.client.blogPost.findMany({
            where,
            orderBy: { publishedAt: 'desc' },
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
            select: summarySelect,
          }),
        ]);
        return {
          items: rows.map((r) => this.summary(r)),
          page: query.page,
          pageSize: query.pageSize,
          total,
        };
      },
    );
  }

  async post(slug: string): Promise<BlogPostDetail> {
    const post = await this.cache.getOrSet(CacheNamespace.blog, `post:${slug}`, async () => {
      const row = await this.prisma.client.blogPost.findFirst({
        where: { slug, ...live(new Date()) },
        select: { ...summarySelect, contentHtml: true, seoTitle: true, seoDescription: true },
      });
      if (!row) return null;
      return {
        ...this.summary(row),
        contentHtml: row.contentHtml,
        seo: { title: row.seoTitle ?? row.title, description: row.seoDescription ?? row.excerpt },
      };
    });
    if (!post) throw notFound('Post');
    return post;
  }

  categories(): Promise<BlogCategoryItem[]> {
    return this.cache.getOrSet(CacheNamespace.blog, 'categories', async () => {
      const now = new Date();
      const rows = await this.prisma.client.blogCategory.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { posts: { where: live(now) } } } },
      });
      return rows.map((c) => ({
        slug: c.slug,
        name: c.name,
        description: c.description,
        postCount: c._count.posts,
      }));
    });
  }

  // ── Admin ──────────────────────────────────────────────────────────────────

  async adminList(query: AdminBlogListQuery): Promise<Paginated<AdminBlogPost>> {
    const where: Prisma.BlogPostWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.client.blogPost.count({ where }),
      this.prisma.client.blogPost.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: adminInclude,
      }),
    ]);
    return {
      items: rows.map((r) => this.toAdmin(r)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async adminGet(id: string): Promise<AdminBlogPost> {
    const row = await this.prisma.client.blogPost.findUnique({
      where: { id },
      include: adminInclude,
    });
    if (!row) throw notFound('Post');
    return this.toAdmin(row);
  }

  /** Saves the content. Publishing is a separate step (blog:publish). */
  async save(id: string | null, input: BlogPostInput, authorId: string): Promise<AdminBlogPost> {
    await assertUploaded(this.prisma, [input.coverKey]);
    const html = sanitizeRichText(input.contentHtml);
    if (!html)
      throw new UnprocessableEntityException({
        code: 'EMPTY_CONTENT',
        message: 'The post has no content left after removing unsupported formatting',
      });
    const data = {
      title: input.title,
      slug: input.slug,
      excerpt: input.excerpt ?? autoExcerpt(html),
      contentHtml: html,
      coverKey: input.coverKey,
      coverAlt: input.coverAlt,
      categoryId: input.categoryId,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      readingMinutes: readingMinutes(html),
    };
    const existing = id
      ? await this.prisma.client.blogPost.findUnique({ where: { id }, select: { slug: true } })
      : null;
    if (id && !existing) throw notFound('Post');
    const saved = await (
      id
        ? this.prisma.client.blogPost.update({ where: { id }, data, include: adminInclude })
        : this.prisma.client.blogPost.create({ data: { ...data, authorId }, include: adminInclude })
    ).catch((error: unknown) => mapWriteError(error, { slug: 'URL slug' }));
    await this.changed([existing?.slug, saved.slug]);
    return this.toAdmin(saved);
  }

  async setStatus(id: string, input: BlogPublishInput): Promise<AdminBlogPost> {
    const post = await this.prisma.client.blogPost.findUnique({ where: { id } });
    if (!post) throw notFound('Post');
    const now = new Date();
    let publishedAt = post.publishedAt;
    if (input.status === 'PUBLISHED')
      publishedAt = post.publishedAt && post.publishedAt <= now ? post.publishedAt : now;
    if (input.status === 'SCHEDULED') {
      publishedAt = new Date(input.publishAt!);
      if (publishedAt <= now)
        throw new ConflictException({
          code: 'SCHEDULE_IN_PAST',
          message: 'Choose a time in the future, or publish now',
        });
    }
    const saved = await this.prisma.client.blogPost.update({
      where: { id },
      data: { status: input.status, publishedAt },
      include: adminInclude,
    });
    await this.changed([saved.slug]);
    return this.toAdmin(saved);
  }

  /** Worker: scheduled posts whose time has come go live. Returns how many. */
  async publishDue(now = new Date()): Promise<number> {
    const due = await this.prisma.client.blogPost.findMany({
      where: { status: 'SCHEDULED', publishedAt: { lte: now } },
      select: { id: true, slug: true },
    });
    if (due.length === 0) return 0;
    const updated = await this.prisma.client.blogPost.updateMany({
      where: { id: { in: due.map((p) => p.id) }, status: 'SCHEDULED' },
      data: { status: 'PUBLISHED' },
    });
    await this.changed(due.map((p) => p.slug));
    return updated.count;
  }

  async adminCategories(): Promise<AdminBlogCategory[]> {
    const rows = await this.prisma.client.blogCategory.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { posts: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      postCount: c._count.posts,
    }));
  }

  async saveCategory(id: string | null, input: BlogCategoryInput): Promise<AdminBlogCategory> {
    const saved = await (
      id
        ? this.prisma.client.blogCategory.update({ where: { id }, data: input })
        : this.prisma.client.blogCategory.create({ data: input })
    ).catch((error: unknown) => mapWriteError(error, { slug: 'URL slug' }));
    await this.changed([]);
    return (await this.adminCategories()).find((c) => c.id === saved.id)!;
  }

  async deleteCategory(id: string): Promise<void> {
    const deleted = await this.prisma.client.blogCategory.deleteMany({ where: { id } });
    if (deleted.count !== 1) throw notFound('Category');
    await this.changed([]);
  }

  private async changed(slugs: (string | undefined)[]): Promise<void> {
    await Promise.all([
      this.cache.invalidateNamespace(CacheNamespace.blog),
      this.cache.invalidateNamespace(CacheNamespace.homepage),
      // The sitemap lists posts.
      this.cache.invalidate(CacheNamespace.product, 'sitemap'),
    ]);
    await this.revalidation.revalidate([
      StorefrontTags.blog,
      StorefrontTags.homepage,
      ...slugs.filter((s): s is string => Boolean(s)).map(StorefrontTags.post),
    ]);
  }

  private summary(row: SummaryRow): BlogPostSummary {
    const p = row.author?.profile;
    return {
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      coverUrl: this.media.publicUrl(row.coverKey),
      coverAlt: row.coverAlt,
      category: row.category,
      author: p ? `${p.firstName} ${p.lastName}` : null,
      publishedAt: (row.publishedAt ?? new Date()).toISOString(),
      readingMinutes: row.readingMinutes ?? 1,
    };
  }

  private toAdmin(row: AdminRow): AdminBlogPost {
    const p = row.author?.profile;
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      contentHtml: row.contentHtml,
      coverKey: row.coverKey,
      coverUrl: this.media.publicUrl(row.coverKey),
      coverAlt: row.coverAlt,
      categoryId: row.categoryId,
      status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      readingMinutes: row.readingMinutes,
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      author: p ? `${p.firstName} ${p.lastName}` : (row.author?.email ?? null),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
