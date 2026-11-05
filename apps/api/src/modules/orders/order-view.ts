import type { Prisma } from '@repo/database';
import {
  MAX_MPESA_ATTEMPTS,
  type MpesaPaymentState,
  type OrderDetail,
  type OrderSummary,
} from '@repo/shared-types';
import type { MediaUrlService } from '../../infrastructure/media/media-url.service.js';
import { customerMessageFor } from '../payments/mpesa/mpesa.types.js';

export const orderDetailInclude = {
  items: {
    orderBy: { id: 'asc' },
    include: { product: { select: { slug: true, category: { select: { slug: true } } } } },
  },
  statusHistory: { where: { isCustomerVisible: true }, orderBy: { createdAt: 'asc' } },
  shipments: { orderBy: { createdAt: 'desc' }, take: 1 },
  reservations: { where: { status: 'ACTIVE' }, select: { expiresAt: true } },
  // The payment created at checkout (later rows are only unexpected extra payments).
  payments: {
    where: { provider: 'MPESA' },
    orderBy: { createdAt: 'asc' },
    take: 1,
    select: {
      attempts: {
        orderBy: { createdAt: 'desc' },
        select: { status: true, phoneMasked: true, resultCode: true },
      },
    },
  },
} satisfies Prisma.OrderInclude;

export type OrderWithDetail = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

interface ShippingAddressSnapshot {
  recipientName: string;
  county: string;
  town: string;
  street: string;
  building?: string | null;
  landmark?: string | null;
}

function mpesaState(order: OrderWithDetail, paymentDueBy: number | null): MpesaPaymentState | null {
  if (order.paymentProvider !== 'MPESA') return null;
  const attempts = order.payments[0]?.attempts ?? [];
  const latest = attempts[0];
  if (!latest) return null;
  const attemptsLeft = Math.max(0, MAX_MPESA_ATTEMPTS - attempts.length);
  const open = latest.status === 'INITIATED' || latest.status === 'PENDING';
  return {
    status: latest.status,
    phoneMasked: latest.phoneMasked,
    message: customerMessageFor(latest.status, latest.resultCode),
    attemptsLeft,
    canRetry:
      order.paymentStatus === 'PENDING' &&
      !open &&
      attemptsLeft > 0 &&
      paymentDueBy !== null &&
      paymentDueBy > Date.now(),
  };
}

export function toOrderDetail(order: OrderWithDetail, media: MediaUrlService): OrderDetail {
  const address = order.shippingAddress as unknown as ShippingAddressSnapshot;
  const holdUntil = order.reservations.map((r) => r.expiresAt.getTime());
  const dueBy =
    order.paymentStatus === 'PENDING' && holdUntil.length ? Math.min(...holdUntil) : null;
  const shipment = order.shipments[0];
  return {
    orderNumber: order.orderNumber,
    trackingToken: order.trackingToken,
    placedAt: order.placedAt.toISOString(),
    email: order.email,
    customerName: order.customerName,
    phone: order.phone,
    shippingAddress: {
      recipientName: address.recipientName,
      county: address.county,
      town: address.town,
      street: address.street,
      building: address.building ?? null,
      landmark: address.landmark ?? null,
    },
    shippingMethodName: order.shippingMethodName,
    paymentProvider: order.paymentProvider,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    paymentDueBy: dueBy === null ? null : new Date(dueBy).toISOString(),
    mpesa: mpesaState(order, dueBy),
    lines: order.items.map((item) => ({
      productSlug: item.product?.slug ?? null,
      productName: item.productName,
      variantName: item.variantName,
      sku: item.sku,
      imageUrl: media.publicUrl(item.imageKey),
      categorySlug: item.product?.category.slug ?? null,
      unitPriceMinor: item.unitPriceMinor,
      quantity: item.quantity,
      lineTotalMinor: item.lineTotalMinor,
    })),
    totals: {
      subtotalMinor: order.subtotalMinor,
      discountMinor: order.discountMinor,
      shippingMinor: order.shippingMinor,
      taxMinor: order.taxMinor,
      roundingMinor: order.roundingMinor,
      totalMinor: order.totalMinor,
    },
    timeline: order.statusHistory.map((h) => ({
      field: h.field,
      status: h.toStatus,
      note: h.note,
      at: h.createdAt.toISOString(),
    })),
    shipment: shipment
      ? {
          carrier: shipment.carrier,
          trackingNumber: shipment.trackingNumber,
          trackingUrl: shipment.trackingUrl,
        }
      : null,
  };
}

export function toOrderSummary(
  order: Prisma.OrderGetPayload<{ include: { items: { select: { quantity: true } } } }>,
): OrderSummary {
  return {
    orderNumber: order.orderNumber,
    placedAt: order.placedAt.toISOString(),
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    totalMinor: order.totalMinor,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
  };
}
