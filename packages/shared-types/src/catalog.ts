export const ProductCondition = {
  NEW: 'NEW',
  REFURBISHED: 'REFURBISHED',
} as const;
export type ProductCondition = (typeof ProductCondition)[keyof typeof ProductCondition];

export const ProductStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus];

export const StockStatus = {
  IN_STOCK: 'IN_STOCK',
  LOW_STOCK: 'LOW_STOCK',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
} as const;
export type StockStatus = (typeof StockStatus)[keyof typeof StockStatus];

export function stockStatusFor(available: number, lowStockThreshold: number): StockStatus {
  if (available <= 0) return StockStatus.OUT_OF_STOCK;
  if (available <= lowStockThreshold) return StockStatus.LOW_STOCK;
  return StockStatus.IN_STOCK;
}

/** Media prefixes in object storage (Cloudflare R2). Object keys are `${prefix}/${uuid}.${ext}`. */
export const MEDIA_PREFIXES = ['products', 'categories', 'brands', 'banners', 'blog'] as const;
export type MediaPrefix = (typeof MEDIA_PREFIXES)[number];
