import type { Permission } from './access-control.js';
import type { AdminPayment, OrderDetail } from './commerce.js';
import type { MinorUnits } from './money.js';
import type { FulfillmentStatus, PaymentProvider, PaymentStatus } from './orders.js';

// ── Dashboard ───────────────────────────────────────────────────────────────

export const DASHBOARD_RANGES = ['7d', '30d', '90d'] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export interface DashboardSummary {
  range: DashboardRange;
  /** Inclusive start and exclusive end of the period (ISO). */
  from: string;
  to: string;
  /** Paid order totals in the period, less refunds already sent. */
  revenueMinor: MinorUnits;
  previousRevenueMinor: MinorUnits;
  paidOrders: number;
  previousPaidOrders: number;
  averageOrderMinor: MinorUnits;
  newCustomers: number;
  /** Right now, not limited to the period. */
  awaitingPayment: number;
  toFulfil: number;
  lowStock: number;
  outOfStock: number;
  openRefunds: number;
  /** One entry per day in Nairobi time, including days with no sales. */
  daily: { date: string; revenueMinor: MinorUnits; orders: number }[];
  topProducts: { productId: string; name: string; units: number; revenueMinor: MinorUnits }[];
  ordersByStatus: Record<FulfillmentStatus, number>;
  recentOrders: AdminOrderSummary[];
}

// ── Catalog ─────────────────────────────────────────────────────────────────

export type ProductStatusValue = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface AdminProductListItem {
  id: string;
  slug: string;
  name: string;
  status: ProductStatusValue;
  isFeatured: boolean;
  brand: { id: string; name: string };
  category: { id: string; name: string };
  imageUrl: string | null;
  /** Default variant price. */
  priceMinor: MinorUnits | null;
  variantCount: number;
  /** Units available to sell across active variants. */
  available: number;
  updatedAt: string;
}

export interface AdminVariant {
  id: string;
  sku: string;
  name: string;
  priceMinor: MinorUnits;
  compareAtPriceMinor: MinorUnits | null;
  costMinor: MinorUnits | null;
  attributes: Record<string, string>;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  weightGrams: number | null;
  barcode: string | null;
  inventory: { onHand: number; reserved: number; lowStockThreshold: number };
}

export interface AdminProductImage {
  id: string;
  storageKey: string;
  url: string | null;
  alt: string;
  width: number | null;
  height: number | null;
  sortOrder: number;
}

export interface AdminProductSpec {
  group: string;
  key: string;
  value: string;
  isFilterable: boolean;
}

export interface AdminProduct {
  id: string;
  slug: string;
  name: string;
  brandId: string;
  categoryId: string;
  condition: 'NEW' | 'REFURBISHED';
  status: ProductStatusValue;
  shortDescription: string | null;
  /** Sanitized HTML. */
  description: string | null;
  warrantyMonths: number;
  warrantyText: string | null;
  isFeatured: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  ratingAvg: number;
  ratingCount: number;
  salesCount: number;
  variants: AdminVariant[];
  images: AdminProductImage[];
  specifications: AdminProductSpec[];
}

export interface MediaUpload {
  id: string;
  storageKey: string;
  url: string | null;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
}

export interface AdminCategory {
  id: string;
  parentId: string | null;
  slug: string;
  name: string;
  description: string | null;
  imageKey: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isVisible: boolean;
  showOnHomepage: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  productCount: number;
}

export interface AdminBrand {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoKey: string | null;
  logoUrl: string | null;
  website: string | null;
  isVisible: boolean;
  isFeatured: boolean;
  sortOrder: number;
  productCount: number;
}

// ── Inventory ───────────────────────────────────────────────────────────────

export type StockLevel = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface InventoryRow {
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  variantName: string;
  isActive: boolean;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  level: StockLevel;
  updatedAt: string;
}

export const STOCK_ADJUSTMENT_REASONS = ['RESTOCK', 'ADJUSTMENT', 'DAMAGE', 'RETURN'] as const;
export type StockAdjustmentReason = (typeof STOCK_ADJUSTMENT_REASONS)[number];

export interface InventoryMovementEntry {
  id: string;
  delta: number;
  reason: string;
  onHandAfter: number;
  reservedAfter: number;
  orderNumber: string | null;
  actor: string | null;
  note: string | null;
  createdAt: string;
}

// ── Orders ──────────────────────────────────────────────────────────────────

export interface AdminOrderSummary {
  id: string;
  orderNumber: string;
  placedAt: string;
  customerName: string;
  email: string;
  phone: string;
  itemCount: number;
  totalMinor: MinorUnits;
  paymentProvider: PaymentProvider | null;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
}

export interface AdminOrderHistoryEntry {
  field: 'PAYMENT' | 'FULFILLMENT';
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  actor: string | null;
  isCustomerVisible: boolean;
  at: string;
}

export interface AdminShipment {
  id: string;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: string;
  shippedAt: string | null;
  deliveredAt: string | null;
}

export interface AdminOrderDetail extends Omit<OrderDetail, 'timeline'> {
  id: string;
  userId: string | null;
  customerNote: string | null;
  internalNote: string | null;
  history: AdminOrderHistoryEntry[];
  payments: AdminPayment[];
  shipments: AdminShipment[];
  /** Fulfilment steps allowed now, after payment rules (e.g. M-Pesa orders must be paid first). */
  allowedTransitions: FulfillmentStatus[];
  /** Cash on delivery collected: staff can record the payment. */
  canRecordCashPayment: boolean;
}

// ── Customers ───────────────────────────────────────────────────────────────

export interface AdminCustomerSummary {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  emailVerified: boolean;
  orderCount: number;
  /** Paid orders only. */
  totalSpentMinor: MinorUnits;
  lastOrderAt: string | null;
  createdAt: string;
}

export interface AdminCustomerDetail extends AdminCustomerSummary {
  marketingOptIn: boolean;
  addresses: {
    id: string;
    label: string | null;
    recipientName: string;
    phone: string;
    county: string;
    town: string;
    street: string;
    isDefault: boolean;
  }[];
  orders: AdminOrderSummary[];
}

// ── Content ─────────────────────────────────────────────────────────────────

export type BannerPlacementValue = 'HERO' | 'PROMO' | 'CATEGORY_STRIP';

export interface AdminBanner {
  id: string;
  placement: BannerPlacementValue;
  eyebrow: string | null;
  title: string;
  titleHighlight: string | null;
  subtitle: string | null;
  highlights: string[];
  annotation: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  secondaryCtaLabel: string | null;
  secondaryCtaHref: string | null;
  imageKey: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  theme: string;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
}

export interface AdminHomepageSection {
  id: string;
  key: string;
  title: string;
  subtitle: string | null;
  isActive: boolean;
  sortOrder: number;
  /** "curated" sections list products by hand; others fill themselves (e.g. best sellers). */
  source: string;
  items: { productId: string; name: string; slug: string; status: ProductStatusValue }[];
}

// ── Staff and roles ─────────────────────────────────────────────────────────

export interface AdminRoleDetail {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Permission[];
  staffCount: number;
}

export interface AdminStaffMember {
  id: string;
  email: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  roles: { id: string; key: string; name: string }[];
  mfaEnabled: boolean;
  /** Invited but has not set a password yet. */
  invitePending: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}
