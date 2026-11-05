import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import { Prisma } from '@repo/database';
import {
  FULFILLMENT_TRANSITIONS,
  type AdminOrderDetail,
  type AdminOrderSummary,
  type FulfillmentStatus,
  type Paginated,
} from '@repo/shared-types';
import type {
  AdminOrderListQuery,
  CashPaymentInput,
  OrderCancelInput,
  OrderTransitionInput,
} from '@repo/validation';
import { API_ENV } from '../../../config/env.js';
import { MailService } from '../../../infrastructure/mail/mail.service.js';
import { emails, type OrderEmailData } from '../../../infrastructure/mail/templates.js';
import { MediaUrlService } from '../../../infrastructure/media/media-url.service.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { OrderPaymentService } from '../../orders/order-payment.service.js';
import { orderDetailInclude, toOrderDetail } from '../../orders/order-view.js';
import { StockChangeNotifier } from '../../orders/stock-change.notifier.js';
import { adminPaymentsInclude, toAdminPayment } from '../../payments/admin-payment.view.js';
import { RefundService } from '../../payments/refund.service.js';
import { releaseCouponRedemption } from '../../coupons/coupon.service.js';
import { notFound } from '../admin-errors.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 10_000, timeout: 30_000 } as const;
const CANCELLABLE: FulfillmentStatus[] = ['PENDING', 'PROCESSING', 'PACKED'];
/** Payment states in which goods may be prepared and sent. */
const SETTLED = ['PAID', 'PARTIALLY_REFUNDED'];

const adminDetailInclude = {
  ...orderDetailInclude,
  statusHistory: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { email: true } } } },
  shipments: { orderBy: { createdAt: 'desc' } },
  payments: adminPaymentsInclude,
} satisfies Prisma.OrderInclude;
type AdminOrderRow = Prisma.OrderGetPayload<{ include: typeof adminDetailInclude }>;

/** Nairobi is UTC+3 all year. Dates in filters are local calendar days. */
const nairobiDayStart = (isoDate: string) => new Date(`${isoDate}T00:00:00+03:00`);

/**
 * Staff order handling. Every change is a conditional update on the current status, so two staff
 * members acting on the same order cannot both succeed, and every step is written to the history.
 */
@Injectable()
export class AdminOrdersService {
  private readonly storefrontUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUrlService,
    private readonly payments: OrderPaymentService,
    private readonly refunds: RefundService,
    private readonly stock: StockChangeNotifier,
    private readonly mail: MailService,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.storefrontUrl = env.STOREFRONT_URL.replace(/\/$/, '');
  }

  async list(query: AdminOrderListQuery): Promise<Paginated<AdminOrderSummary>> {
    const where: Prisma.OrderWhereInput = {
      ...(query.fulfillmentStatus ? { fulfillmentStatus: query.fulfillmentStatus } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.from || query.to
        ? {
            placedAt: {
              ...(query.from ? { gte: nairobiDayStart(query.from) } : {}),
              ...(query.to
                ? { lt: new Date(nairobiDayStart(query.to).getTime() + 86_400_000) }
                : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { orderNumber: { contains: query.q.toUpperCase() } },
              { email: { contains: query.q.toLowerCase() } },
              { phone: { contains: query.q.replace(/\D/g, '') || query.q } },
              { customerName: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.client.order.count({ where }),
      this.prisma.client.order.findMany({
        where,
        orderBy: { placedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { items: { select: { quantity: true } } },
      }),
    ]);
    return { items: rows.map(toAdminSummary), page: query.page, pageSize: query.pageSize, total };
  }

  async detail(orderNumber: string): Promise<AdminOrderDetail> {
    const order = await this.prisma.client.order.findUnique({
      where: { orderNumber },
      include: adminDetailInclude,
    });
    if (!order) throw notFound('Order');
    return this.toAdminDetail(order);
  }

  /** Moves the order one step along PENDING → PROCESSING → PACKED → SHIPPED → DELIVERED. */
  async transition(
    orderNumber: string,
    input: OrderTransitionInput,
    actorId: string,
  ): Promise<AdminOrderDetail> {
    const order = await this.load(orderNumber);
    if (!allowedTransitions(order).includes(input.to))
      throw new ConflictException({
        code: 'INVALID_TRANSITION',
        message: transitionRefusal(order, input.to),
      });
    if (input.to === 'SHIPPED' && !input.shipment)
      throw new ConflictException({
        code: 'SHIPMENT_REQUIRED',
        message: 'Enter the courier before marking the order as shipped',
      });

    await this.prisma.client.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.order.updateMany({
        where: { id: order.id, fulfillmentStatus: order.fulfillmentStatus },
        data: {
          fulfillmentStatus: input.to,
          ...(input.to === 'DELIVERED' ? { deliveredAt: now } : {}),
        },
      });
      if (claimed.count !== 1) throw changedMeanwhile();
      if (input.to === 'SHIPPED' && input.shipment)
        await tx.shipment.create({
          data: {
            orderId: order.id,
            carrier: input.shipment.carrier,
            trackingNumber: input.shipment.trackingNumber,
            trackingUrl: input.shipment.trackingUrl,
            status: 'IN_TRANSIT',
            shippedAt: now,
          },
        });
      if (input.to === 'DELIVERED')
        await tx.shipment.updateMany({
          where: { orderId: order.id, status: { notIn: ['DELIVERED', 'RETURNED'] } },
          data: { status: 'DELIVERED', deliveredAt: now },
        });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          field: 'FULFILLMENT',
          fromStatus: order.fulfillmentStatus,
          toStatus: input.to,
          note: input.note || defaultNote(input.to),
          actorId,
        },
      });
    }, TX);

    if (input.to === 'SHIPPED' && input.shipment)
      await this.mail.send(emails.orderShipped(order.email, this.emailData(order), input.shipment));
    if (input.to === 'DELIVERED')
      await this.mail.send(emails.orderDelivered(order.email, this.emailData(order)));
    return this.detail(orderNumber);
  }

  /**
   * Cancels an order that has not shipped. Held stock is released; stock already sold goes back on
   * sale unless `restock` is false. Money received is queued for refund.
   */
  async cancel(
    orderNumber: string,
    input: OrderCancelInput,
    actorId: string,
  ): Promise<AdminOrderDetail> {
    const order = await this.load(orderNumber);
    if (!CANCELLABLE.includes(order.fulfillmentStatus))
      throw new ConflictException({
        code: 'INVALID_TRANSITION',
        message:
          order.fulfillmentStatus === 'CANCELLED'
            ? 'This order is already cancelled'
            : 'Shipped orders cannot be cancelled. Record a return instead.',
      });

    const refundDue = await this.prisma.client.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.order.updateMany({
        where: {
          id: order.id,
          fulfillmentStatus: order.fulfillmentStatus,
          paymentStatus: order.paymentStatus,
        },
        data: {
          fulfillmentStatus: 'CANCELLED',
          cancelledAt: now,
          cancelReason: input.reason,
          // An unpaid M-Pesa order stops waiting for payment.
          ...(order.paymentStatus === 'PENDING' ? { paymentStatus: 'FAILED' } : {}),
        },
      });
      if (claimed.count !== 1) throw changedMeanwhile();

      await this.payments.releaseReservations(tx, order.id);
      await releaseCouponRedemption(tx, order.id);
      if (input.restock) await this.restockSold(tx, order.id, actorId);

      if (order.paymentStatus === 'PENDING' || order.paymentStatus === 'UNPAID') {
        await tx.payment.updateMany({
          where: { orderId: order.id, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
        await tx.paymentAttempt.updateMany({
          where: { payment: { orderId: order.id }, status: { in: ['INITIATED', 'PENDING'] } },
          data: { status: 'CANCELLED', completedAt: now },
        });
      }
      const history: Prisma.OrderStatusHistoryCreateManyInput[] = [
        {
          orderId: order.id,
          field: 'FULFILLMENT',
          fromStatus: order.fulfillmentStatus,
          toStatus: 'CANCELLED',
          note: input.reason,
          actorId,
        },
      ];
      if (order.paymentStatus === 'PENDING')
        history.push({
          orderId: order.id,
          field: 'PAYMENT',
          fromStatus: 'PENDING',
          toStatus: 'FAILED',
          note: 'Order cancelled before payment',
          actorId,
        });

      // Refund whatever has been received and not yet refunded or queued.
      let refundQueued = false;
      if (SETTLED.includes(order.paymentStatus)) {
        const settled = order.payments.find((p) => p.paidAt);
        if (settled) {
          const open = settled.refunds
            .filter((r) => ['REQUESTED', 'APPROVED', 'PROCESSING'].includes(r.status))
            .reduce((sum, r) => sum + r.amountMinor, 0);
          const remaining = settled.amountMinor - settled.refundedMinor - open;
          if (remaining > 0) {
            await this.refunds.requestTx(tx, {
              paymentId: settled.id,
              amountMinor: remaining,
              reason: `Order cancelled: ${input.reason}`,
              requestedById: actorId,
            });
            refundQueued = true;
          }
        }
      }
      await tx.orderStatusHistory.createMany({ data: history });
      return refundQueued;
    }, TX);

    await this.stock.stockChanged(
      order.items.map((i) => i.product?.slug ?? null).filter((s): s is string => Boolean(s)),
    );
    await this.mail.send(
      emails.orderCancelled(order.email, this.emailData(order), input.reason, refundDue),
    );
    return this.detail(orderNumber);
  }

  /** Cash collected on delivery. */
  async recordCashPayment(
    orderNumber: string,
    input: CashPaymentInput,
    actorId: string,
  ): Promise<AdminOrderDetail> {
    const order = await this.load(orderNumber);
    if (!canRecordCash(order))
      throw new ConflictException({
        code: 'NOT_PAYABLE',
        message: 'Only unpaid cash-on-delivery orders can be marked as paid',
      });
    await this.prisma.client
      .$transaction(async (tx) => {
        const now = new Date();
        const claimed = await tx.order.updateMany({
          where: { id: order.id, paymentStatus: 'UNPAID', fulfillmentStatus: { not: 'CANCELLED' } },
          data: { paymentStatus: 'PAID', paidAt: now },
        });
        if (claimed.count !== 1) throw changedMeanwhile();
        await tx.payment.updateMany({
          where: { orderId: order.id, provider: 'CASH_ON_DELIVERY', status: 'PENDING' },
          data: { status: 'SUCCEEDED', paidAt: now, providerReference: input.reference },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            field: 'PAYMENT',
            fromStatus: 'UNPAID',
            toStatus: 'PAID',
            note: 'Cash received on delivery',
            actorId,
          },
        });
      }, TX)
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw new ConflictException({
            code: 'ALREADY_EXISTS',
            message: 'That receipt reference is already recorded',
          });
        throw error;
      });
    return this.detail(orderNumber);
  }

  async setInternalNote(orderNumber: string, note: string): Promise<AdminOrderDetail> {
    const updated = await this.prisma.client.order.updateMany({
      where: { orderNumber },
      data: { internalNote: note || null },
    });
    if (updated.count !== 1) throw notFound('Order');
    return this.detail(orderNumber);
  }

  /** Sold units go back on hand (inside the cancel transaction). */
  private async restockSold(tx: Tx, orderId: string, actorId: string): Promise<void> {
    const consumed = await tx.stockReservation.findMany({
      where: { orderId, status: 'CONSUMED' },
      orderBy: { variantId: 'asc' },
    });
    for (const r of consumed) {
      const [after] = await tx.$queryRaw<{ onHand: number; reserved: number }[]>(Prisma.sql`
        UPDATE inventory SET "onHand" = "onHand" + ${r.quantity}, "updatedAt" = now()
        WHERE "variantId" = ${r.variantId}::uuid RETURNING "onHand", reserved`);
      if (!after) continue;
      await tx.inventoryMovement.create({
        data: {
          variantId: r.variantId,
          delta: r.quantity,
          reason: 'RETURN',
          onHandAfter: after.onHand,
          reservedAfter: after.reserved,
          orderId,
          actorId,
          note: 'Order cancelled',
        },
      });
      // Mark as handled so a second pass never restocks twice.
      await tx.stockReservation.update({
        where: { id: r.id },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
    }
  }

  private async load(orderNumber: string): Promise<AdminOrderRow> {
    const order = await this.prisma.client.order.findUnique({
      where: { orderNumber },
      include: adminDetailInclude,
    });
    if (!order) throw notFound('Order');
    return order;
  }

  private emailData(order: AdminOrderRow): OrderEmailData {
    return {
      orderNumber: order.orderNumber,
      totalMinor: order.totalMinor,
      lines: order.items.map((i) => ({
        name: `${i.productName} (${i.variantName})`,
        quantity: i.quantity,
      })),
      trackUrl: `${this.storefrontUrl}/track-order/${order.trackingToken}`,
    };
  }

  private toAdminDetail(order: AdminOrderRow): AdminOrderDetail {
    // The customer view expects visible history only and the checkout payment's attempts, newest first.
    const { timeline: _timeline, ...base } = toOrderDetail(
      {
        ...order,
        statusHistory: order.statusHistory.filter((h) => h.isCustomerVisible),
        payments: order.payments
          .filter((p) => p.provider === 'MPESA')
          .slice(0, 1)
          .map((p) => ({ attempts: [...p.attempts].reverse() })),
      },
      this.media,
    );
    return {
      ...base,
      id: order.id,
      userId: order.userId,
      customerNote: order.customerNote,
      internalNote: order.internalNote,
      history: order.statusHistory.map((h) => ({
        field: h.field,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        note: h.note,
        actor: h.actor?.email ?? null,
        isCustomerVisible: h.isCustomerVisible,
        at: h.createdAt.toISOString(),
      })),
      payments: order.payments.map(toAdminPayment),
      shipments: order.shipments.map((s) => ({
        id: s.id,
        carrier: s.carrier,
        trackingNumber: s.trackingNumber,
        trackingUrl: s.trackingUrl,
        status: s.status,
        shippedAt: s.shippedAt?.toISOString() ?? null,
        deliveredAt: s.deliveredAt?.toISOString() ?? null,
      })),
      allowedTransitions: allowedTransitions(order),
      canRecordCashPayment: canRecordCash(order),
    };
  }
}

/** Forward steps allowed now. Prepaid orders (M-Pesa, card) must be paid before work starts. */
function allowedTransitions(order: {
  fulfillmentStatus: FulfillmentStatus;
  paymentStatus: string;
  paymentProvider: string | null;
}): FulfillmentStatus[] {
  const next = FULFILLMENT_TRANSITIONS[order.fulfillmentStatus].filter((s) => s !== 'CANCELLED');
  const cod = order.paymentProvider === 'CASH_ON_DELIVERY';
  const payable = cod ? ['UNPAID', ...SETTLED] : SETTLED;
  if (!payable.includes(order.paymentStatus)) return [];
  // Cash must be collected before an order counts as delivered.
  if (cod && order.paymentStatus === 'UNPAID') return next.filter((s) => s !== 'DELIVERED');
  return next;
}

function transitionRefusal(
  order: {
    fulfillmentStatus: FulfillmentStatus;
    paymentStatus: string;
    paymentProvider: string | null;
  },
  to: FulfillmentStatus,
): string {
  if (!FULFILLMENT_TRANSITIONS[order.fulfillmentStatus].includes(to))
    return `An order that is ${order.fulfillmentStatus.toLowerCase()} cannot move to ${to.toLowerCase()}`;
  if (order.paymentProvider === 'CASH_ON_DELIVERY' && to === 'DELIVERED')
    return 'Record the cash payment before marking the order as delivered';
  return 'This order has not been paid yet';
}

function canRecordCash(order: {
  paymentProvider: string | null;
  paymentStatus: string;
  fulfillmentStatus: string;
}) {
  return (
    order.paymentProvider === 'CASH_ON_DELIVERY' &&
    order.paymentStatus === 'UNPAID' &&
    order.fulfillmentStatus !== 'CANCELLED'
  );
}

function defaultNote(status: FulfillmentStatus): string {
  return (
    (
      {
        PROCESSING: 'We are preparing your order',
        PACKED: 'Your order is packed and ready to go',
        SHIPPED: 'Your order is on its way',
        DELIVERED: 'Delivered',
      } as Record<string, string>
    )[status] ?? status
  );
}

const changedMeanwhile = () =>
  new ConflictException({
    code: 'ORDER_CHANGED',
    message: 'This order was just updated by someone else. Refresh and try again.',
  });

export function toAdminSummary(
  o: Prisma.OrderGetPayload<{ include: { items: { select: { quantity: true } } } }>,
): AdminOrderSummary {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    placedAt: o.placedAt.toISOString(),
    customerName: o.customerName,
    email: o.email,
    phone: o.phone,
    itemCount: o.items.reduce((sum, i) => sum + i.quantity, 0),
    totalMinor: o.totalMinor,
    paymentProvider: o.paymentProvider,
    paymentStatus: o.paymentStatus,
    fulfillmentStatus: o.fulfillmentStatus,
  };
}
