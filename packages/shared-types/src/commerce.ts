import type { StockStatus } from './catalog.js';
import type { MinorUnits } from './money.js';
import type { AppliedCoupon } from './content.js';
import type { FulfillmentStatus, PaymentProvider, PaymentStatus } from './orders.js';

/** Maximum units of one variant per cart line. */
export const MAX_LINE_QUANTITY = 10;

/** STK Push prompts allowed per order (the first one plus retries). */
export const MAX_MPESA_ATTEMPTS = 3;

export type CartLineIssue = 'OUT_OF_STOCK' | 'QUANTITY_REDUCED' | 'UNAVAILABLE';

export interface CartLine {
  variantId: string;
  productSlug: string;
  productName: string;
  variantName: string;
  sku: string;
  categorySlug: string;
  imageUrl: string | null;
  unitPriceMinor: MinorUnits;
  compareAtPriceMinor: MinorUnits | null;
  quantity: number;
  lineTotalMinor: MinorUnits;
  /** Most the customer can have of this line right now (stock, capped at 10). */
  maxQuantity: number;
  stockStatus: StockStatus;
  /** Set when the line cannot be bought as-is. */
  issue: CartLineIssue | null;
}

export interface Cart {
  id: string | null;
  lines: CartLine[];
  itemCount: number;
  subtotalMinor: MinorUnits;
  /** True when every line can be ordered as shown. */
  checkoutReady: boolean;
}

export interface ShippingOption {
  code: string;
  name: string;
  description: string | null;
  priceMinor: MinorUnits;
  /** Price before a free-delivery threshold was applied. */
  basePriceMinor: MinorUnits;
  freeAboveMinor: MinorUnits | null;
  etaMinDays: number;
  etaMaxDays: number;
  codAllowed: boolean;
}

export type CheckoutPaymentMethod = 'MPESA' | 'CASH_ON_DELIVERY';

export interface PaymentMethodOption {
  method: CheckoutPaymentMethod;
  available: boolean;
  /** Why it is unavailable, shown to the customer. */
  reason: string | null;
  /** Development only: M-Pesa is simulated (no real money moves). */
  simulated: boolean;
}

export interface CheckoutTotals {
  subtotalMinor: MinorUnits;
  discountMinor: MinorUnits;
  shippingMinor: MinorUnits;
  /** VAT included in the total. */
  taxMinor: MinorUnits;
  roundingMinor: MinorUnits;
  totalMinor: MinorUnits;
}

export interface CheckoutQuote {
  cart: Cart;
  shippingOptions: ShippingOption[];
  selectedShipping: ShippingOption | null;
  paymentMethods: PaymentMethodOption[];
  totals: CheckoutTotals | null;
  /** The coupon applied to these totals, if any. */
  coupon: AppliedCoupon | null;
  /** Why the entered code could not be applied, in plain language. */
  couponError: string | null;
}

export interface OrderLine {
  productSlug: string | null;
  productName: string;
  variantName: string;
  sku: string;
  imageUrl: string | null;
  categorySlug: string | null;
  unitPriceMinor: MinorUnits;
  quantity: number;
  lineTotalMinor: MinorUnits;
}

export interface OrderTimelineEntry {
  field: 'PAYMENT' | 'FULFILLMENT';
  status: string;
  note: string | null;
  at: string;
}

export type MpesaAttemptStatus =
  'INITIATED' | 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'CANCELLED';

/** The latest M-Pesa prompt for an order, as the customer should see it. */
export interface MpesaPaymentState {
  status: MpesaAttemptStatus;
  /** e.g. 2547******78 */
  phoneMasked: string | null;
  /** Why the last prompt did not complete, in plain language. */
  message: string | null;
  attemptsLeft: number;
  /** The customer may ask for a new prompt now. */
  canRetry: boolean;
}

export interface OrderDetail {
  orderNumber: string;
  trackingToken: string;
  placedAt: string;
  email: string;
  customerName: string;
  phone: string;
  shippingAddress: {
    recipientName: string;
    county: string;
    town: string;
    street: string;
    building: string | null;
    landmark: string | null;
  };
  shippingMethodName: string | null;
  paymentProvider: PaymentProvider | null;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  /** Stock is held until this time while payment is pending. */
  paymentDueBy: string | null;
  /** M-Pesa orders only. */
  mpesa: MpesaPaymentState | null;
  lines: OrderLine[];
  totals: CheckoutTotals;
  timeline: OrderTimelineEntry[];
  shipment: {
    carrier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
  } | null;
}

export interface OrderSummary {
  orderNumber: string;
  placedAt: string;
  itemCount: number;
  totalMinor: MinorUnits;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
}

export interface PlaceOrderResponse {
  order: OrderDetail;
  /** What the customer must do next. */
  next: { type: 'AWAIT_MPESA'; simulated: boolean } | { type: 'CONFIRMED' };
}

/** Staff view of an order's payments (admin). */
export interface AdminPaymentAttempt {
  id: string;
  status: MpesaAttemptStatus;
  amountMinor: MinorUnits;
  phoneMasked: string | null;
  checkoutRequestId: string | null;
  resultCode: string | null;
  resultDesc: string | null;
  providerReference: string | null;
  createdAt: string;
  completedAt: string | null;
}

export type RefundStatus =
  'REQUESTED' | 'APPROVED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'REJECTED';

export interface AdminRefund {
  id: string;
  paymentId: string;
  amountMinor: MinorUnits;
  reason: string;
  status: RefundStatus;
  providerReference: string | null;
  requestedBy: string | null;
  approvedBy: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface AdminPayment {
  id: string;
  provider: PaymentProvider;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
  amountMinor: MinorUnits;
  refundedMinor: MinorUnits;
  providerReference: string | null;
  /** Set on the payment that settled the order; extra payments (duplicates, late) have none. */
  paidAt: string | null;
  createdAt: string;
  attempts: AdminPaymentAttempt[];
  refunds: AdminRefund[];
}
