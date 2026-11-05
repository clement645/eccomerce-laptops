import { z } from 'zod';
import { EDITABLE_SETTING_KEYS, type EditableSettingKey } from '@repo/shared-types';
import { emailSchema, kenyanPhoneSchema, slugSchema, uuidSchema } from './primitives.js';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const imageKey = z
  .string()
  .regex(/^[a-z0-9/_.-]{5,200}$/, 'Invalid image key')
  .refine((v) => !v.includes('..'), 'Invalid image key');

const page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
};

/** Unguessable token from an emailed link. */
export const linkTokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/) });

// ── Blog ────────────────────────────────────────────────────────────────────

export const blogListQuerySchema = z.object({ ...page, category: slugSchema.optional() });
export type BlogListQuery = z.infer<typeof blogListQuerySchema>;

export const blogPostInputSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    slug: slugSchema,
    excerpt: optionalText(300),
    /** Rich text; sanitized on the server before it is stored. */
    contentHtml: z.string().trim().min(1, 'Write the post').max(100_000),
    coverKey: imageKey.nullish().transform((v) => v ?? null),
    coverAlt: optionalText(200),
    categoryId: uuidSchema.nullish().transform((v) => v ?? null),
    seoTitle: optionalText(70),
    seoDescription: optionalText(170),
  })
  .refine((v) => !v.coverKey || Boolean(v.coverAlt), {
    message: 'Describe the cover image for screen readers',
    path: ['coverAlt'],
  });
export type BlogPostInput = z.infer<typeof blogPostInputSchema>;

/** Publish now, schedule for later, or take back to draft / archive. */
export const blogPublishSchema = z
  .object({
    status: z.enum(['DRAFT', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED']),
    publishAt: z.iso.datetime().optional(),
  })
  .refine((v) => v.status !== 'SCHEDULED' || Boolean(v.publishAt), {
    message: 'Choose when to publish',
    path: ['publishAt'],
  });
export type BlogPublishInput = z.infer<typeof blogPublishSchema>;

export const blogCategoryInputSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: slugSchema,
  description: optionalText(300),
});
export type BlogCategoryInput = z.infer<typeof blogCategoryInputSchema>;

export const adminBlogListQuerySchema = z.object({
  ...page,
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']).optional(),
  q: z
    .string()
    .optional()
    .transform((v) => v?.trim().slice(0, 100) || undefined),
});
export type AdminBlogListQuery = z.infer<typeof adminBlogListQuerySchema>;

// ── Reviews ─────────────────────────────────────────────────────────────────

export const reviewListQuerySchema = z.object({
  ...page,
  pageSize: z.coerce.number().int().min(1).max(20).default(5),
  sort: z.enum(['newest', 'highest', 'lowest']).default('newest'),
});
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;

export const reviewInputSchema = z.object({
  rating: z.number().int().min(1, 'Choose a rating').max(5),
  title: optionalText(120),
  body: z
    .string()
    .trim()
    .min(20, 'Tell other shoppers a bit more (at least 20 characters)')
    .max(3_000),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

export const reviewModerationSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    note: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.status !== 'REJECTED' || (v.note?.length ?? 0) >= 3, {
    message: 'Say why the review was rejected',
    path: ['note'],
  });
export type ReviewModerationInput = z.infer<typeof reviewModerationSchema>;

export const adminReviewListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});
export type AdminReviewListQuery = z.infer<typeof adminReviewListQuerySchema>;

// ── Coupons ─────────────────────────────────────────────────────────────────

export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/, 'Codes are 3–32 letters, numbers, dashes or underscores');

export const couponInputSchema = z
  .object({
    code: couponCodeSchema,
    description: optionalText(200),
    type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
    /** 1–9000 basis points (0.01%–90%). */
    percentBps: z
      .number()
      .int()
      .min(1)
      .max(9_000)
      .nullish()
      .transform((v) => v ?? null),
    amountMinor: z
      .number()
      .int()
      .positive()
      .max(100_000_000)
      .nullish()
      .transform((v) => v ?? null),
    maxDiscountMinor: z
      .number()
      .int()
      .positive()
      .nullish()
      .transform((v) => v ?? null),
    minOrderMinor: z.number().int().min(0).default(0),
    startsAt: z.iso
      .datetime()
      .nullish()
      .transform((v) => v ?? null),
    endsAt: z.iso
      .datetime()
      .nullish()
      .transform((v) => v ?? null),
    maxRedemptions: z
      .number()
      .int()
      .positive()
      .nullish()
      .transform((v) => v ?? null),
    maxPerCustomer: z
      .number()
      .int()
      .positive()
      .nullish()
      .transform((v) => v ?? null),
    firstOrderOnly: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .refine((v) => (v.type === 'PERCENTAGE' ? v.percentBps !== null : v.amountMinor !== null), {
    message: 'Enter the discount',
    path: ['percentBps'],
  })
  .refine((v) => !v.startsAt || !v.endsAt || v.startsAt < v.endsAt, {
    message: 'The end must be after the start',
    path: ['endsAt'],
  });
export type CouponInput = z.infer<typeof couponInputSchema>;

// ── Newsletter and contact ──────────────────────────────────────────────────

export const newsletterSubscribeSchema = z.object({
  email: emailSchema,
  /** Where the form was, e.g. "footer". */
  source: z
    .string()
    .trim()
    .max(40)
    .regex(/^[a-z0-9_-]*$/)
    .optional(),
});
export type NewsletterSubscribeInput = z.infer<typeof newsletterSubscribeSchema>;

export const contactMessageSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: emailSchema,
  // Accepts its own output (null) too: forms validate with this schema before sending.
  phone: z
    .union([z.literal(''), kenyanPhoneSchema])
    .nullish()
    .transform((v) => v || null),
  subject: z.string().trim().min(3, 'Add a subject').max(120),
  message: z.string().trim().min(10, 'Write a little more so we can help').max(5_000),
  /** Hidden field. People leave it empty; bots fill it in. */
  website: z.string().max(200).optional(),
});
export type ContactMessageInput = z.infer<typeof contactMessageSchema>;

export const contactStatusSchema = z.object({
  status: z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED', 'SPAM']),
});

export const adminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.string().max(20).optional(),
  q: z
    .string()
    .optional()
    .transform((v) => v?.trim().slice(0, 100) || undefined),
});
export type AdminListQuery = z.infer<typeof adminListQuerySchema>;

// ── Store settings ──────────────────────────────────────────────────────────

const nullableUrl = z
  .union([z.literal(''), z.url({ protocol: /^https$/ })])
  .nullish()
  .transform((v) => v || null);

export const settingSchemas = {
  'store.profile': z.object({
    name: z.string().trim().min(2).max(80),
    tagline: optionalText(120),
    currency: z.literal('KES'),
    locale: z.literal('en-KE'),
  }),
  'store.contact': z.object({
    email: z
      .union([z.literal(''), emailSchema])
      .nullish()
      .transform((v) => v || null),
    phone: z
      .union([z.literal(''), kenyanPhoneSchema])
      .nullish()
      .transform((v) => v || null),
    whatsappNumber: z
      .union([z.literal(''), kenyanPhoneSchema])
      .nullish()
      .transform((v) => v || null),
    address: optionalText(300),
    mapUrl: nullableUrl,
    openingHours: optionalText(200),
  }),
  'store.social': z.object({
    facebook: nullableUrl,
    instagram: nullableUrl,
    x: nullableUrl,
    tiktok: nullableUrl,
    youtube: nullableUrl,
  }),
  'announcement.bar': z.object({
    enabled: z.boolean(),
    messages: z.array(z.string().trim().min(2).max(80)).max(5),
    href: z
      .string()
      .trim()
      .max(300)
      .refine(
        (v) => v === '' || /^\/(?!\/)/.test(v) || /^https:\/\//.test(v),
        'Use a path like /deals or an https:// link',
      )
      .nullish()
      .transform((v) => v || null),
  }),
  'checkout.reservation': z.object({ holdMinutes: z.number().int().min(5).max(60) }),
  'checkout.cashOnDelivery': z.object({
    enabled: z.boolean(),
    counties: z.array(z.string().trim().min(2).max(60)).max(47),
    /** 0 means no limit. */
    maxOrderMinor: z.number().int().min(0).max(1_000_000_000),
  }),
} satisfies Record<EditableSettingKey, z.ZodType>;

export const settingKeySchema = z.enum(EDITABLE_SETTING_KEYS);
