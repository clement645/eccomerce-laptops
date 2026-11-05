import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@repo/database';
import type {
  AdminProduct,
  AdminProductListItem,
  Paginated,
  ProductStatusValue,
} from '@repo/shared-types';
import type { AdminProductListQuery, ProductInput, VariantInput } from '@repo/validation';
import { sanitizeRichText } from '../../../common/sanitize/rich-text.js';
import { MediaUrlService } from '../../../infrastructure/media/media-url.service.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { mapWriteError, notFound } from '../admin-errors.js';
import { CatalogChangeNotifier } from '../catalog-change.notifier.js';
import { assertUploaded } from '../media/media-keys.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 10_000, timeout: 30_000 } as const;
const WRITE_LABELS = { slug: 'URL slug', sku: 'SKU' };

const detailInclude = {
  variants: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: { inventory: true } },
  images: { orderBy: { sortOrder: 'asc' } },
  specifications: { orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.ProductInclude;
type ProductWithDetail = Prisma.ProductGetPayload<{ include: typeof detailInclude }>;

@Injectable()
export class AdminProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUrlService,
    private readonly notifier: CatalogChangeNotifier,
  ) {}

  async list(query: AdminProductListQuery): Promise<Paginated<AdminProductListItem>> {
    const where: Prisma.ProductWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { slug: { contains: query.q.toLowerCase() } },
              { variants: { some: { sku: { contains: query.q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.client.product.count({ where }),
      this.prisma.client.product.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          brand: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
          images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { storageKey: true } },
          variants: {
            select: {
              priceMinor: true,
              isDefault: true,
              isActive: true,
              inventory: { select: { onHand: true, reserved: true } },
            },
          },
        },
      }),
    ]);
    return {
      items: rows.map((p) => {
        const active = p.variants.filter((v) => v.isActive);
        const main = active.find((v) => v.isDefault) ?? active[0] ?? null;
        return {
          id: p.id,
          slug: p.slug,
          name: p.name,
          status: p.status,
          isFeatured: p.isFeatured,
          brand: p.brand,
          category: p.category,
          imageUrl: this.media.publicUrl(p.images[0]?.storageKey),
          priceMinor: main?.priceMinor ?? null,
          variantCount: p.variants.length,
          available: active.reduce(
            (sum, v) =>
              sum + Math.max(0, (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0)),
            0,
          ),
          updatedAt: p.updatedAt.toISOString(),
        };
      }),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(id: string): Promise<AdminProduct> {
    const product = await this.prisma.client.product.findUnique({
      where: { id },
      include: detailInclude,
    });
    if (!product) throw notFound('Product');
    return this.toAdmin(product);
  }

  /** New products start as drafts. */
  async create(input: ProductInput, actorId: string): Promise<AdminProduct> {
    await assertUploaded(
      this.prisma,
      input.images.map((i) => i.storageKey),
    );
    const variants = withOneDefault(input.variants);
    const id = await this.prisma.client
      .$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            ...this.coreFields(input),
            status: 'DRAFT',
            specifications: {
              create: input.specifications.map((s, i) => ({ ...s, sortOrder: i })),
            },
            images: { create: input.images.map((img, i) => ({ ...img, sortOrder: i })) },
          },
        });
        for (const [index, variant] of variants.entries())
          await this.createVariant(tx, product.id, variant, index, actorId);
        return product.id;
      }, TX)
      .catch((error: unknown) => mapWriteError(error, WRITE_LABELS));
    const created = await this.get(id);
    await this.notifier.productsChanged([created.slug]);
    return created;
  }

  /**
   * Replaces the product's details, specifications and images. Variants missing from the input are
   * deactivated, never deleted, because orders and stock history refer to them. Stock levels are
   * not changed here (use inventory adjustments), except opening stock for new variants.
   */
  async update(id: string, input: ProductInput, actorId: string): Promise<AdminProduct> {
    const existing = await this.prisma.client.product.findUnique({
      where: { id },
      include: { variants: { select: { id: true } } },
    });
    if (!existing) throw notFound('Product');
    const known = new Set(existing.variants.map((v) => v.id));
    const foreign = input.variants.find((v) => v.id && !known.has(v.id));
    if (foreign)
      throw new UnprocessableEntityException({
        code: 'INVALID_VARIANT',
        message: 'A variant does not belong to this product',
      });
    if (existing.status === 'PUBLISHED' && !input.variants.some((v) => v.isActive))
      throw new UnprocessableEntityException({
        code: 'NO_ACTIVE_VARIANT',
        message: 'A published product needs at least one active variant',
      });
    await assertUploaded(
      this.prisma,
      input.images.map((i) => i.storageKey),
    );
    const variants = withOneDefault(input.variants);

    await this.prisma.client
      .$transaction(async (tx) => {
        await tx.product.update({ where: { id }, data: this.coreFields(input) });
        // Clear the default first: a partial unique index allows only one per product.
        await tx.productVariant.updateMany({
          where: { productId: id },
          data: { isDefault: false },
        });
        const kept = new Set<string>();
        for (const [index, variant] of variants.entries()) {
          if (variant.id) {
            kept.add(variant.id);
            await tx.productVariant.update({
              where: { id: variant.id },
              data: { ...variantFields(variant), sortOrder: index },
            });
            await tx.inventory.upsert({
              where: { variantId: variant.id },
              create: { variantId: variant.id, lowStockThreshold: variant.lowStockThreshold },
              update: { lowStockThreshold: variant.lowStockThreshold },
            });
          } else {
            kept.add(await this.createVariant(tx, id, variant, index, actorId));
          }
        }
        await tx.productVariant.updateMany({
          where: { productId: id, id: { notIn: [...kept] } },
          data: { isActive: false, isDefault: false },
        });
        await tx.productSpecification.deleteMany({ where: { productId: id } });
        await tx.productSpecification.createMany({
          data: input.specifications.map((s, i) => ({ ...s, productId: id, sortOrder: i })),
        });
        await tx.productImage.deleteMany({ where: { productId: id } });
        await tx.productImage.createMany({
          data: input.images.map((img, i) => ({ ...img, productId: id, sortOrder: i })),
        });
      }, TX)
      .catch((error: unknown) => mapWriteError(error, WRITE_LABELS));
    const updated = await this.get(id);
    await this.notifier.productsChanged([existing.slug, updated.slug]);
    return updated;
  }

  async setStatus(id: string, status: ProductStatusValue): Promise<AdminProduct> {
    const product = await this.prisma.client.product.findUnique({
      where: { id },
      include: { variants: { where: { isActive: true }, select: { id: true } } },
    });
    if (!product) throw notFound('Product');
    if (status === 'PUBLISHED' && product.variants.length === 0)
      throw new UnprocessableEntityException({
        code: 'NO_ACTIVE_VARIANT',
        message: 'Add an active variant before publishing',
      });
    await this.prisma.client.product.update({
      where: { id },
      data: {
        status,
        // Keep the first publication date (used for "newest" sorting).
        ...(status === 'PUBLISHED' && !product.publishedAt ? { publishedAt: new Date() } : {}),
      },
    });
    await this.notifier.productsChanged([product.slug]);
    return this.get(id);
  }

  private coreFields(input: ProductInput) {
    return {
      name: input.name,
      slug: input.slug,
      brandId: input.brandId,
      categoryId: input.categoryId,
      condition: input.condition,
      shortDescription: input.shortDescription,
      description: sanitizeRichText(input.description),
      warrantyMonths: input.warrantyMonths,
      warrantyText: input.warrantyText,
      isFeatured: input.isFeatured,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
    };
  }

  private async createVariant(
    tx: Tx,
    productId: string,
    variant: VariantInput,
    index: number,
    actorId: string,
  ): Promise<string> {
    const created = await tx.productVariant.create({
      data: {
        ...variantFields(variant),
        productId,
        sortOrder: index,
        inventory: {
          create: { onHand: variant.initialStock, lowStockThreshold: variant.lowStockThreshold },
        },
      },
    });
    if (variant.initialStock > 0)
      await tx.inventoryMovement.create({
        data: {
          variantId: created.id,
          delta: variant.initialStock,
          reason: 'RESTOCK',
          onHandAfter: variant.initialStock,
          reservedAfter: 0,
          actorId,
          note: 'Opening stock',
        },
      });
    return created.id;
  }

  private toAdmin(p: ProductWithDetail): AdminProduct {
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      brandId: p.brandId,
      categoryId: p.categoryId,
      condition: p.condition,
      status: p.status,
      shortDescription: p.shortDescription,
      description: p.description,
      warrantyMonths: p.warrantyMonths,
      warrantyText: p.warrantyText,
      isFeatured: p.isFeatured,
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      ratingAvg: Number(p.ratingAvg),
      ratingCount: p.ratingCount,
      salesCount: p.salesCount,
      variants: p.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        name: v.name,
        priceMinor: v.priceMinor,
        compareAtPriceMinor: v.compareAtPriceMinor,
        costMinor: v.costMinor,
        attributes: (v.attributes ?? {}) as Record<string, string>,
        isDefault: v.isDefault,
        isActive: v.isActive,
        sortOrder: v.sortOrder,
        weightGrams: v.weightGrams,
        barcode: v.barcode,
        inventory: {
          onHand: v.inventory?.onHand ?? 0,
          reserved: v.inventory?.reserved ?? 0,
          lowStockThreshold: v.inventory?.lowStockThreshold ?? 5,
        },
      })),
      images: p.images.map((img) => ({
        id: img.id,
        storageKey: img.storageKey,
        url: this.media.publicUrl(img.storageKey),
        alt: img.alt,
        width: img.width,
        height: img.height,
        sortOrder: img.sortOrder,
      })),
      specifications: p.specifications.map((s) => ({
        group: s.group,
        key: s.key,
        value: s.value,
        isFilterable: s.isFilterable,
      })),
    };
  }
}

function variantFields(v: VariantInput) {
  return {
    sku: v.sku,
    name: v.name,
    priceMinor: v.priceMinor,
    compareAtPriceMinor: v.compareAtPriceMinor,
    costMinor: v.costMinor,
    attributes: v.attributes,
    isDefault: v.isDefault,
    isActive: v.isActive,
    weightGrams: v.weightGrams,
    barcode: v.barcode,
  };
}

/** Exactly one active default: the one marked, or else the first active variant. */
function withOneDefault(variants: VariantInput[]): VariantInput[] {
  const marked = variants.findIndex((v) => v.isDefault && v.isActive);
  const chosen =
    marked >= 0
      ? marked
      : Math.max(
          0,
          variants.findIndex((v) => v.isActive),
        );
  return variants.map((v, i) => ({ ...v, isDefault: i === chosen }));
}
