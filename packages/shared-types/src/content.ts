import type { MinorUnits } from './money.js';

// ── Blog ────────────────────────────────────────────────────────────────────

export interface BlogPostSummary {
  slug: string;
  title: string;
  excerpt: string | null;
  coverUrl: string | null;
  coverAlt: string | null;
  category: { slug: string; name: string } | null;
  author: string | null;
  publishedAt: string;
  readingMinutes: number;
}

export interface BlogPostDetail extends BlogPostSummary {
  /** Sanitized on the server; safe to render as HTML. */
  contentHtml: string;
  seo: { title: string; description: string | null };
}

export interface BlogCategoryItem {
  slug: string;
  name: string;
  description: string | null;
  postCount: number;
}

export type BlogPostStatusValue = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';

export interface AdminBlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  contentHtml: string;
  coverKey: string | null;
  coverUrl: string | null;
  coverAlt: string | null;
  categoryId: string | null;
  status: BlogPostStatusValue;
  publishedAt: string | null;
  readingMinutes: number | null;
  seoTitle: string | null;
  seoDescription: string | null;
  author: string | null;
  updatedAt: string;
}

export interface AdminBlogCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  postCount: number;
}

// ── Reviews ─────────────────────────────────────────────────────────────────

export interface ProductReviewItem {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  /** First name and last initial only. */
  author: string;
  verifiedPurchase: boolean;
  createdAt: string;
}

export interface ReviewSummary {
  /** Approved reviews only; 0 when there are none. */
  average: number;
  count: number;
  /** Count per star rating, 5 down to 1. */
  distribution: { stars: number; count: number }[];
}

export interface ProductReviewsPage {
  summary: ReviewSummary;
  items: ProductReviewItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ReviewEligibility {
  /** True once an order with this product has been delivered to the customer. */
  canReview: boolean;
  reason: 'NOT_PURCHASED' | null;
  /** The customer's own review, if any. Editing it sends it back for moderation. */
  existing: {
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    rating: number;
    title: string | null;
    body: string;
  } | null;
}

export interface AdminReview {
  id: string;
  product: { id: string; name: string; slug: string };
  author: { name: string; email: string };
  rating: number;
  title: string | null;
  body: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  verifiedPurchase: boolean;
  moderationNote: string | null;
  moderatedBy: string | null;
  moderatedAt: string | null;
  createdAt: string;
}

// ── Coupons ─────────────────────────────────────────────────────────────────

export interface AdminCoupon {
  id: string;
  code: string;
  description: string | null;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  percentBps: number | null;
  amountMinor: MinorUnits | null;
  maxDiscountMinor: MinorUnits | null;
  minOrderMinor: MinorUnits;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  maxPerCustomer: number | null;
  redemptionCount: number;
  firstOrderOnly: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface AppliedCoupon {
  code: string;
  description: string | null;
  discountMinor: MinorUnits;
}

// ── Newsletter, contact ─────────────────────────────────────────────────────

export interface AdminSubscriber {
  id: string;
  email: string;
  status: 'PENDING' | 'SUBSCRIBED' | 'UNSUBSCRIBED';
  source: string | null;
  consentAt: string;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
}

export type ContactStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'SPAM';

export interface AdminContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: ContactStatus;
  handledBy: string | null;
  createdAt: string;
}

// ── Store settings ──────────────────────────────────────────────────────────

/** Settings staff can edit. Each key has its own schema in @repo/validation. */
export const EDITABLE_SETTING_KEYS = [
  'store.profile',
  'store.contact',
  'store.social',
  'announcement.bar',
  'checkout.reservation',
  'checkout.cashOnDelivery',
] as const;
export type EditableSettingKey = (typeof EDITABLE_SETTING_KEYS)[number];
