import { z } from 'zod';
import { DASHBOARD_RANGES, PERMISSIONS, STOCK_ADJUSTMENT_REASONS } from '@repo/shared-types';
import { passwordSchema } from './auth.js';
import { emailSchema, moneyMinorSchema, slugSchema, uuidSchema } from './primitives.js';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/** Relative path on the storefront or an https URL. */
const linkSchema = z
  .string()
  .trim()
  .max(300)
  .refine(
    (v) => /^\/(?!\/)/.test(v) || /^https:\/\//.test(v),
    'Use a path like /shop or an https:// link',
  )
  .nullish()
  .transform((v) => v ?? null);

const searchText = z
  .string()
  .optional()
  .transform((v) => v?.trim().slice(0, 100) || undefined);

const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};

// ── Dashboard ───────────────────────────────────────────────────────────────

export const dashboardQuerySchema = z.object({ range: z.enum(DASHBOARD_RANGES).default('30d') });

// ── Products ────────────────────────────────────────────────────────────────

export const adminProductListQuerySchema = z.object({
  ...page,
  q: searchText,
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  categoryId: uuidSchema.optional(),
  brandId: uuidSchema.optional(),
});
export type AdminProductListQuery = z.infer<typeof adminProductListQuerySchema>;

const skuSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Letters, numbers, dots, dashes and underscores only');

export const variantInputSchema = z
  .object({
    /** Present when updating an existing variant. */
    id: uuidSchema.optional(),
    sku: skuSchema,
    name: z.string().trim().min(1).max(120),
    priceMinor: moneyMinorSchema.refine((v) => v > 0, 'Price must be above zero'),
    compareAtPriceMinor: moneyMinorSchema.nullish().transform((v) => v ?? null),
    costMinor: moneyMinorSchema.nullish().transform((v) => v ?? null),
    attributes: z
      .record(z.string().trim().min(1).max(40), z.string().trim().max(80))
      .default({})
      .refine((v) => Object.keys(v).length <= 12, 'At most 12 attributes'),
    isDefault: z.boolean().default(false),
    isActive: z.boolean().default(true),
    weightGrams: z
      .number()
      .int()
      .positive()
      .max(200_000)
      .nullish()
      .transform((v) => v ?? null),
    barcode: optionalText(64),
    lowStockThreshold: z.number().int().min(0).max(10_000).default(5),
    /** Opening stock for a new variant. Later changes go through inventory adjustments. */
    initialStock: z.number().int().min(0).max(100_000).default(0),
  })
  .refine((v) => v.compareAtPriceMinor === null || v.compareAtPriceMinor > v.priceMinor, {
    message: 'The "was" price must be higher than the price',
    path: ['compareAtPriceMinor'],
  });
export type VariantInput = z.infer<typeof variantInputSchema>;

export const productSpecInputSchema = z.object({
  group: z.string().trim().min(1).max(60),
  key: z.string().trim().min(1).max(60),
  value: z.string().trim().min(1).max(200),
  isFilterable: z.boolean().default(false),
});

export const productImageInputSchema = z.object({
  /** Storage key returned by the upload endpoint. */
  storageKey: z
    .string()
    .regex(/^[a-z0-9/_.-]{5,200}$/, 'Invalid image key')
    .refine((v) => !v.includes('..'), 'Invalid image key'),
  alt: z.string().trim().min(1, 'Describe the image for screen readers').max(200),
});

export const productInputSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    slug: slugSchema,
    brandId: uuidSchema,
    categoryId: uuidSchema,
    condition: z.enum(['NEW', 'REFURBISHED']).default('NEW'),
    shortDescription: optionalText(300),
    /** Rich text; sanitized on the server before it is stored. */
    description: optionalText(20_000),
    warrantyMonths: z.number().int().min(0).max(120).default(0),
    warrantyText: optionalText(200),
    isFeatured: z.boolean().default(false),
    seoTitle: optionalText(70),
    seoDescription: optionalText(170),
    variants: z.array(variantInputSchema).min(1, 'Add at least one variant').max(30),
    specifications: z.array(productSpecInputSchema).max(80).default([]),
    images: z.array(productImageInputSchema).max(12).default([]),
  })
  .superRefine((v, ctx) => {
    const defaults = v.variants.filter((x) => x.isDefault).length;
    if (defaults > 1)
      ctx.addIssue({
        code: 'custom',
        path: ['variants'],
        message: 'Only one variant can be the default',
      });
    const skus = new Set<string>();
    v.variants.forEach((x, i) => {
      const sku = x.sku.toUpperCase();
      if (skus.has(sku))
        ctx.addIssue({
          code: 'custom',
          path: ['variants', i, 'sku'],
          message: 'SKUs must be unique',
        });
      skus.add(sku);
    });
    const keys = new Set<string>();
    v.specifications.forEach((x, i) => {
      const key = x.key.toLowerCase();
      if (keys.has(key))
        ctx.addIssue({
          code: 'custom',
          path: ['specifications', i, 'key'],
          message: 'Duplicate specification',
        });
      keys.add(key);
    });
  });
export type ProductInput = z.infer<typeof productInputSchema>;

export const productStatusSchema = z.object({ status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']) });

// ── Categories and brands ───────────────────────────────────────────────────

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slugSchema,
  parentId: uuidSchema.nullish().transform((v) => v ?? null),
  description: optionalText(500),
  imageKey: productImageInputSchema.shape.storageKey.nullish().transform((v) => v ?? null),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  isVisible: z.boolean().default(true),
  showOnHomepage: z.boolean().default(false),
  seoTitle: optionalText(70),
  seoDescription: optionalText(170),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const brandInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: slugSchema,
  description: optionalText(500),
  logoKey: productImageInputSchema.shape.storageKey.nullish().transform((v) => v ?? null),
  website: z
    .url({ protocol: /^https$/ })
    .max(200)
    .nullish()
    .transform((v) => v ?? null),
  isVisible: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});
export type BrandInput = z.infer<typeof brandInputSchema>;

// ── Inventory ───────────────────────────────────────────────────────────────

export const inventoryQuerySchema = z.object({
  ...page,
  q: searchText,
  level: z.enum(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']).optional(),
});
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;

export const stockAdjustmentSchema = z
  .object({
    reason: z.enum(STOCK_ADJUSTMENT_REASONS),
    /** Change in units on hand; negative to remove stock. */
    delta: z
      .number()
      .int()
      .min(-100_000)
      .max(100_000)
      .refine((v) => v !== 0, 'Enter a change'),
    note: z.string().trim().max(300).optional(),
    lowStockThreshold: z.number().int().min(0).max(10_000).optional(),
  })
  .refine((v) => (v.reason === 'RESTOCK' || v.reason === 'RETURN' ? v.delta > 0 : true), {
    message: 'Restocks and returns add stock',
    path: ['delta'],
  })
  .refine((v) => (v.reason === 'DAMAGE' ? v.delta < 0 : true), {
    message: 'Damaged stock is removed',
    path: ['delta'],
  })
  .refine((v) => v.reason !== 'ADJUSTMENT' || (v.note?.length ?? 0) >= 3, {
    message: 'Explain the adjustment',
    path: ['note'],
  });
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

// ── Orders ──────────────────────────────────────────────────────────────────

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

export const adminOrderListQuerySchema = z.object({
  ...page,
  q: searchText,
  fulfillmentStatus: z
    .enum(['PENDING', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
    .optional(),
  paymentStatus: z
    .enum(['UNPAID', 'PENDING', 'PAID', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED'])
    .optional(),
  from: isoDate,
  to: isoDate,
});
export type AdminOrderListQuery = z.infer<typeof adminOrderListQuerySchema>;

export const orderTransitionSchema = z.object({
  to: z.enum(['PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED']),
  /** Shown to the customer on the order timeline. */
  note: z.string().trim().max(300).optional(),
  /** Required when shipping. */
  shipment: z
    .object({
      carrier: z.string().trim().min(2).max(60),
      trackingNumber: optionalText(80),
      trackingUrl: z
        .url({ protocol: /^https$/ })
        .max(300)
        .nullish()
        .transform((v) => v ?? null),
    })
    .optional(),
});
export type OrderTransitionInput = z.infer<typeof orderTransitionSchema>;

export const orderCancelSchema = z.object({
  reason: z.string().trim().min(3).max(300),
  /** Put the units back on sale (false for items lost or damaged in transit). */
  restock: z.boolean().default(true),
});
export type OrderCancelInput = z.infer<typeof orderCancelSchema>;

export const orderNoteSchema = z.object({ internalNote: z.string().trim().max(2_000) });

export const cashPaymentSchema = z.object({
  /** Receipt or reference written on the delivery slip. */
  reference: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[A-Za-z0-9 /-]+$/),
});
export type CashPaymentInput = z.infer<typeof cashPaymentSchema>;

// ── Customers ───────────────────────────────────────────────────────────────

export const customerListQuerySchema = z.object({
  ...page,
  q: searchText,
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

export const customerStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().trim().min(3).max(300),
});

// ── Content ─────────────────────────────────────────────────────────────────

export const bannerInputSchema = z
  .object({
    placement: z.enum(['HERO', 'PROMO', 'CATEGORY_STRIP']),
    eyebrow: optionalText(60),
    title: z.string().trim().min(2).max(120),
    titleHighlight: optionalText(60),
    subtitle: optionalText(300),
    highlights: z.array(z.string().trim().min(1).max(40)).max(6).default([]),
    annotation: optionalText(80),
    ctaLabel: optionalText(40),
    ctaHref: linkSchema,
    secondaryCtaLabel: optionalText(40),
    secondaryCtaHref: linkSchema,
    imageKey: productImageInputSchema.shape.storageKey.nullish().transform((v) => v ?? null),
    imageAlt: optionalText(200),
    theme: z.enum(['dark', 'light', 'gradient']).default('dark'),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
    startsAt: z.iso
      .datetime()
      .nullish()
      .transform((v) => v ?? null),
    endsAt: z.iso
      .datetime()
      .nullish()
      .transform((v) => v ?? null),
    isActive: z.boolean().default(true),
  })
  .refine((v) => Boolean(v.ctaLabel) === Boolean(v.ctaHref), {
    message: 'Give the button both a label and a link',
    path: ['ctaHref'],
  })
  .refine((v) => !v.imageKey || Boolean(v.imageAlt), {
    message: 'Describe the image for screen readers',
    path: ['imageAlt'],
  })
  .refine((v) => !v.startsAt || !v.endsAt || v.startsAt < v.endsAt, {
    message: 'The end must be after the start',
    path: ['endsAt'],
  });
export type BannerInput = z.infer<typeof bannerInputSchema>;

export const homepageSectionInputSchema = z.object({
  title: z.string().trim().min(2).max(80),
  subtitle: optionalText(200),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
  /** Product order for curated sections; ignored for automatic ones. */
  productIds: z.array(uuidSchema).max(24).default([]),
});
export type HomepageSectionInput = z.infer<typeof homepageSectionInputSchema>;

// ── Staff and roles ─────────────────────────────────────────────────────────

const permissionList = z
  .array(z.enum(PERMISSIONS))
  .max(PERMISSIONS.length)
  .transform((v) => [...new Set(v)]);

export const roleInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: optionalText(200),
  permissions: permissionList,
});
export type RoleInput = z.infer<typeof roleInputSchema>;

export const staffInviteSchema = z.object({
  email: emailSchema,
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  roleIds: z.array(uuidSchema).min(1, 'Choose at least one role').max(10),
});
export type StaffInviteInput = z.infer<typeof staffInviteSchema>;

export const staffUpdateSchema = z.object({
  roleIds: z.array(uuidSchema).min(1).max(10).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;

export const setStaffPasswordSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/),
  password: passwordSchema,
});
export type SetStaffPasswordInput = z.infer<typeof setStaffPasswordSchema>;
