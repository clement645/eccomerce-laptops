import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@repo/database';
import type { AdminBanner, AdminHomepageSection } from '@repo/shared-types';
import type { BannerInput, HomepageSectionInput } from '@repo/validation';
import { MediaUrlService } from '../../../infrastructure/media/media-url.service.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { notFound } from '../admin-errors.js';
import { CatalogChangeNotifier } from '../catalog-change.notifier.js';
import { assertUploaded } from '../media/media-keys.js';

type BannerRow = Prisma.BannerGetPayload<object>;

/** Homepage banners and product sections. Every change refreshes the storefront homepage. */
@Injectable()
export class AdminContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUrlService,
    private readonly notifier: CatalogChangeNotifier,
  ) {}

  async banners(): Promise<AdminBanner[]> {
    const rows = await this.prisma.client.banner.findMany({
      orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((b) => this.toBanner(b));
  }

  async saveBanner(id: string | null, input: BannerInput): Promise<AdminBanner> {
    await assertUploaded(this.prisma, [input.imageKey]);
    const data = {
      ...input,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
    };
    let saved: BannerRow;
    if (id) {
      const exists = await this.prisma.client.banner.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!exists) throw notFound('Banner');
      saved = await this.prisma.client.banner.update({ where: { id }, data });
    } else {
      saved = await this.prisma.client.banner.create({ data });
    }
    await this.notifier.homepageChanged();
    return this.toBanner(saved);
  }

  async deleteBanner(id: string): Promise<void> {
    const deleted = await this.prisma.client.banner.deleteMany({ where: { id } });
    if (deleted.count !== 1) throw notFound('Banner');
    await this.notifier.homepageChanged();
  }

  async sections(): Promise<AdminHomepageSection[]> {
    const rows = await this.prisma.client.homepageSection.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: { product: { select: { id: true, name: true, slug: true, status: true } } },
        },
      },
    });
    return rows.map((s) => ({
      id: s.id,
      key: s.key,
      title: s.title,
      subtitle: s.subtitle,
      isActive: s.isActive,
      sortOrder: s.sortOrder,
      source: ((s.config ?? {}) as { source?: string }).source ?? 'curated',
      items: s.items.map((i) => ({
        productId: i.product.id,
        name: i.product.name,
        slug: i.product.slug,
        status: i.product.status,
      })),
    }));
  }

  /** Title, visibility and order. For curated sections, also the hand-picked products in order. */
  async saveSection(id: string, input: HomepageSectionInput): Promise<AdminHomepageSection> {
    const section = await this.prisma.client.homepageSection.findUnique({ where: { id } });
    if (!section) throw notFound('Section');
    const curated = ((section.config ?? {}) as { source?: string }).source === 'curated';
    const productIds = [...new Set(input.productIds)];
    if (curated && productIds.length) {
      const found = await this.prisma.client.product.count({ where: { id: { in: productIds } } });
      if (found !== productIds.length)
        throw new UnprocessableEntityException({
          code: 'INVALID_REFERENCE',
          message: 'One of the products no longer exists',
        });
    }
    await this.prisma.client.$transaction(async (tx) => {
      await tx.homepageSection.update({
        where: { id },
        data: {
          title: input.title,
          subtitle: input.subtitle,
          isActive: input.isActive,
          sortOrder: input.sortOrder,
        },
      });
      if (curated) {
        await tx.homepageSectionItem.deleteMany({ where: { sectionId: id } });
        await tx.homepageSectionItem.createMany({
          data: productIds.map((productId, sortOrder) => ({ sectionId: id, productId, sortOrder })),
        });
      }
    });
    await this.notifier.homepageChanged();
    return (await this.sections()).find((s) => s.id === id)!;
  }

  private toBanner(b: BannerRow): AdminBanner {
    return {
      id: b.id,
      placement: b.placement,
      eyebrow: b.eyebrow,
      title: b.title,
      titleHighlight: b.titleHighlight,
      subtitle: b.subtitle,
      highlights: b.highlights,
      annotation: b.annotation,
      ctaLabel: b.ctaLabel,
      ctaHref: b.ctaHref,
      secondaryCtaLabel: b.secondaryCtaLabel,
      secondaryCtaHref: b.secondaryCtaHref,
      imageKey: b.imageKey,
      imageUrl: this.media.publicUrl(b.imageKey),
      imageAlt: b.imageAlt,
      theme: b.theme,
      sortOrder: b.sortOrder,
      startsAt: b.startsAt?.toISOString() ?? null,
      endsAt: b.endsAt?.toISOString() ?? null,
      isActive: b.isActive,
    };
  }
}
