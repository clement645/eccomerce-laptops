import { z } from 'zod';
import { MAX_LINE_QUANTITY } from '@repo/shared-types';
import { addressSchema } from './address.js';
import { emailSchema, kenyanPhoneSchema, uuidSchema } from './primitives.js';

export const addCartItemSchema = z.object({
  variantId: uuidSchema,
  quantity: z.coerce.number().int().min(1).max(MAX_LINE_QUANTITY).default(1),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(0).max(MAX_LINE_QUANTITY),
});

const deliveryAddressSchema = addressSchema.omit({ label: true, isDefault: true });

/** Optional coupon field: blank means none. */
const optionalCoupon = z
  .string()
  .trim()
  .max(32)
  .optional()
  .transform((v) => (v ? v.toUpperCase() : undefined));

export const checkoutQuoteSchema = z.object({
  county: z.string().trim().min(2).max(60),
  town: z.string().trim().max(80).optional(),
  shippingMethodCode: z.string().trim().max(40).optional(),
  couponCode: optionalCoupon,
});
export type CheckoutQuoteInput = z.infer<typeof checkoutQuoteSchema>;

export const placeOrderSchema = z
  .object({
    contact: z.object({
      email: emailSchema,
      firstName: z.string().trim().min(1, 'Enter your first name').max(60),
      lastName: z.string().trim().min(1, 'Enter your last name').max(60),
      phone: kenyanPhoneSchema,
    }),
    /** A saved address (signed-in customers) or a new one. */
    addressId: uuidSchema.optional(),
    shippingAddress: deliveryAddressSchema.optional(),
    shippingMethodCode: z.string().trim().min(1).max(40),
    paymentMethod: z.enum(['MPESA', 'CASH_ON_DELIVERY']),
    /** M-Pesa number to prompt (defaults to the contact phone). */
    mpesaPhone: kenyanPhoneSchema.optional(),
    customerNote: z.string().trim().max(500).optional(),
    couponCode: optionalCoupon,
    /** Total the customer reviewed; the order is refused if the server's total differs. */
    expectedTotalMinor: z.number().int().nonnegative(),
  })
  .refine((v) => Boolean(v.addressId) !== Boolean(v.shippingAddress), {
    message: 'Choose a saved address or enter a new one',
    path: ['shippingAddress'],
  });
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

/** Client-generated key that makes "Place order" safe to retry. */
export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,100}$/, 'Invalid Idempotency-Key');

export const simulatePaymentSchema = z.object({
  trackingToken: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/),
  outcome: z.enum(['success', 'failure']),
});

/** Ask for a new M-Pesa prompt for an unpaid order. */
export const retryMpesaSchema = z.object({
  trackingToken: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/),
  /** Defaults to the order's phone number. */
  phone: kenyanPhoneSchema.optional(),
});
export type RetryMpesaInput = z.infer<typeof retryMpesaSchema>;

export const refundRequestSchema = z.object({
  amountMinor: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});
export type RefundRequestInput = z.infer<typeof refundRequestSchema>;

export const refundCompleteSchema = z.object({
  /** M-Pesa (or bank) reference of the money sent back. */
  providerReference: z
    .string()
    .trim()
    .min(4)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/),
});
export type RefundCompleteInput = z.infer<typeof refundCompleteSchema>;
