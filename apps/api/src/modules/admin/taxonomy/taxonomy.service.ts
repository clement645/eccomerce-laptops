import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { AdminBrand, AdminCategory } from '@repo/shared-types';
import type { BrandInput, CategoryInput } from '@repo/validation';
import { MediaUrlService } from '../../../infrastructure/media/media-url.service.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { mapWriteError, notFound } from '../admin-errors.js';
import { CatalogChangeNotifier } from '../catalog-change.notifier.js';
import { assertUploaded } from '../media/media-keys.js';

const LABELS = { slug: 'URL slug', name: 'name' };

/** Categories and brands. Anything still in use cannot be deleted (hide it instead). */
@Injectable()
export class TaxonomyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUrlService,
    private readonly notifier: CatalogChangeNotifier,
  ) {}

  async categories(): Promise<AdminCategory[]> {
    const rows = await this.prisma.client.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      parentId: c.parentId,
      slug: c.slug,
      name: c.name,
      description: c.description,
      imageKey: c.imageKey,
      imageUrl: this.media.publicUrl(c.imageKey),
      sortOrder: c.sortOrder,
      isVisible: c.isVisible,
      showOnHomepage: c.showOnHomepage,
      seoTitle: c.seoTitle,
      seoDescription: c.seoDescription,
      productCount: c._count.products,
    }));
  }

  async saveCategory(id: string | null, input: CategoryInput): Promise<AdminCategory> {
    if (input.parentId) await this.assertNoCycle(id, input.parentId);
    await assertUploaded(this.prisma, [input.imageKey]);
    const saved = await (
      id
        ? this.prisma.client.category.update({ where: { id }, data: input })
        : this.prisma.client.category.create({ data: input })
    ).catch((error: unknown) => mapWriteError(error, LABELS));
    await this.notifier.taxonomyChanged();
    return (await this.categories()).find((c) => c.id === saved.id)!;
  }

  async deleteCategory(id: string): Promise<void> {
    const category = await this.prisma.client.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true, children: true } } },
    });
    if (!category) throw notFound('Category');
    if (category._count.products > 0 || category._count.children > 0)
      throw new ConflictException({
        code: 'IN_USE',
        message: 'Move its products and subcategories first, or hide the category instead',
      });
    await this.prisma.client.category.delete({ where: { id } });
    await this.notifier.taxonomyChanged();
  }

  async brands(): Promise<AdminBrand[]> {
    const rows = await this.prisma.client.brand.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    return rows.map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      description: b.description,
      logoKey: b.logoKey,
      logoUrl: this.media.publicUrl(b.logoKey),
      website: b.website,
      isVisible: b.isVisible,
      isFeatured: b.isFeatured,
      sortOrder: b.sortOrder,
      productCount: b._count.products,
    }));
  }

  async saveBrand(id: string | null, input: BrandInput): Promise<AdminBrand> {
    await assertUploaded(this.prisma, [input.logoKey]);
    const saved = await (
      id
        ? this.prisma.client.brand.update({ where: { id }, data: input })
        : this.prisma.client.brand.create({ data: input })
    ).catch((error: unknown) => mapWriteError(error, LABELS));
    await this.notifier.taxonomyChanged();
    return (await this.brands()).find((b) => b.id === saved.id)!;
  }

  async deleteBrand(id: string): Promise<void> {
    const brand = await this.prisma.client.brand.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!brand) throw notFound('Brand');
    if (brand._count.products > 0)
      throw new ConflictException({
        code: 'IN_USE',
        message: 'This brand has products. Hide it instead, or move the products first.',
      });
    await this.prisma.client.brand.delete({ where: { id } });
    await this.notifier.taxonomyChanged();
  }

  /** A category cannot sit under itself or under one of its own descendants. */
  private async assertNoCycle(id: string | null, parentId: string): Promise<void> {
    let current: string | null = parentId;
    for (let depth = 0; current && depth < 20; depth++) {
      if (current === id)
        throw new UnprocessableEntityException({
          code: 'CATEGORY_CYCLE',
          message: 'A category cannot be placed inside itself',
        });
      const parent: { parentId: string | null } | null =
        await this.prisma.client.category.findUnique({
          where: { id: current },
          select: { parentId: true },
        });
      if (!parent) throw notFound('Parent category');
      current = parent.parentId;
    }
  }
}
