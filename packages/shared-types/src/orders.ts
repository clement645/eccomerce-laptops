export const FulfillmentStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  PACKED: 'PACKED',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const;
export type FulfillmentStatus = (typeof FulfillmentStatus)[keyof typeof FulfillmentStatus];

/** Allowed fulfilment transitions. Anything not listed is rejected by the API. */
export const FULFILLMENT_TRANSITIONS: Readonly<
  Record<FulfillmentStatus, readonly FulfillmentStatus[]>
> = {
  PENDING: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export function canTransitionFulfillment(from: FulfillmentStatus, to: FulfillmentStatus): boolean {
  return FULFILLMENT_TRANSITIONS[from].includes(to);
}

export const PaymentStatus = {
  UNPAID: 'UNPAID',
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentProvider = {
  MPESA: 'MPESA',
  CARD: 'CARD',
  CASH_ON_DELIVERY: 'CASH_ON_DELIVERY',
} as const;
export type PaymentProvider = (typeof PaymentProvider)[keyof typeof PaymentProvider];

export const PaymentAttemptStatus = {
  INITIATED: 'INITIATED',
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  TIMED_OUT: 'TIMED_OUT',
  CANCELLED: 'CANCELLED',
} as const;
export type PaymentAttemptStatus = (typeof PaymentAttemptStatus)[keyof typeof PaymentAttemptStatus];
