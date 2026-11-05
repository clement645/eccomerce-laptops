import type { Prisma } from '@repo/database';
import { discountPercent, stockStatusFor, type ProductCard } from '@repo/shared-types';
import type { MediaUrlService } from '../../infrastructure/media/media-url.service.js';

const NEW_PRODUCT_DAYS = 14;

/** Everything a product card needs, in one query. */
export const productCardSelect = {
  id: true,
  slug: true,
  name: true,
  condition: true,
  ratingAvg: true,
  ratingCount: true,
  publishedAt: true,
  brand: { select: { slug: true, name: true } },
  category: { select: { slug: true, name: true } },
  images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { storageKey: true, alt: true } },
  variants: {
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      isDefault: true,
      priceMinor: true,
      compareAtPriceMinor: true,
      inventory: { select: { onHand: true, reserved: true, lowStockThreshold: true } },
    },
  },
} satisfies Prisma.ProductSelect;

export type ProductCardRow = Prisma.ProductGetPayload<{ select: typeof productCardSelect }>;

/** Products that customers may see right now. */
export function publishedProductWhere(now: Date): Prisma.ProductWhereInput {
  return { status: 'PUBLISHED', publishedAt: { lte: now }, variants: { some: { isActive: true } } };
}

/** Returns null for products without an active variant (they cannot be bought). */
export function toProductCard(
  row: ProductCardRow,
  media: MediaUrlService,
  now: Date,
): ProductCard | null {
  const defaultVariant = row.variants.find((v) => v.isDefault) ?? row.variants[0];
  if (!defaultVariant) return null;

  const available = row.variants.reduce(
    (sum, v) => sum + Math.max(0, (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0)),
    0,
  );
  const prices = new Set(row.variants.map((v) => v.priceMinor));
  const image = row.images[0];
  const imageUrl = media.publicUrl(image?.storageKey);
  const ageDays = row.publishedAt
    ? (now.getTime() - row.publishedAt.getTime()) / 86_400_000
    : Infinity;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    defaultVariantId: defaultVariant.id,
    brand: row.brand,
    category: row.category,
    condition: row.condition,
    priceMinor: defaultVariant.priceMinor,
    compareAtPriceMinor: defaultVariant.compareAtPriceMinor,
    hasPriceRange: prices.size > 1,
    discountPercent: defaultVariant.compareAtPriceMinor
      ? discountPercent(defaultVariant.compareAtPriceMinor, defaultVariant.priceMinor)
      : 0,
    stockStatus: stockStatusFor(available, defaultVariant.inventory?.lowStockThreshold ?? 5),
    rating: row.ratingCount > 0 ? { average: Number(row.ratingAvg), count: row.ratingCount } : null,
    image: imageUrl ? { url: imageUrl, alt: image?.alt ?? row.name } : null,
    isNew: ageDays <= NEW_PRODUCT_DAYS,
  };
}
