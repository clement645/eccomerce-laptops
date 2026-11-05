import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import { Prisma } from '@repo/database';
import { API_ENV } from '../../config/env.js';
import { MailService } from '../../infrastructure/mail/mail.service.js';
import { emails, type OrderEmailData } from '../../infrastructure/mail/templates.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { releaseCouponRedemption } from '../coupons/coupon.service.js';
import { StockChangeNotifier } from './stock-change.notifier.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 10_000, timeout: 30_000 } as const;

/**
 * The single place where payment outcomes change orders and stock (M-Pesa, cash on delivery, expiry).
 * Every transition is conditional on the order still awaiting payment, so duplicate callbacks and
 * racing timeouts are harmless.
 */
@Injectable()
export class OrderPaymentService {
  private readonly logger = new Logger(OrderPaymentService.name);
  private readonly storefrontUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly stock: StockChangeNotifier,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.storefrontUrl = env.STOREFRONT_URL.replace(/\/$/, '');
  }

  /** Payment confirmed by a trusted source. Converts held stock into a sale. Idempotent. */
  async confirmPaid(
    orderId: string,
    providerReference: string | null,
  ): Promise<'paid' | 'already_paid'> {
    const result = await this.prisma.client.$transaction(async (tx) => {
      if (await this.confirmPaidTx(tx, orderId, providerReference)) return 'paid' as const;
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { paymentStatus: true },
      });
      if (order.paymentStatus === 'PAID') return 'already_paid' as const;
      // Payment arrived after the order was cancelled (e.g. the hold expired). Needs a human: refund or re-fulfil.
      throw new ConflictException({
        code: 'ORDER_NOT_PAYABLE',
        message: 'This order is no longer awaiting payment',
      });
    }, TX);

    if (result === 'paid') await this.notifyChange(orderId, 'paid');
    return result;
  }

  /**
   * Marks a pending order paid inside the caller's transaction. Returns false (changing nothing) when
   * the order is no longer awaiting payment. The caller sends notifications after commit.
   */
  async confirmPaidTx(
    tx: Tx,
    orderId: string,
    providerReference: string | null,
    attemptId?: string,
  ): Promise<boolean> {
    const now = new Date();
    const claimed = await tx.order.updateMany({
      where: { id: orderId, paymentStatus: 'PENDING' },
      data: { paymentStatus: 'PAID', paidAt: now },
    });
    if (claimed.count !== 1) return false;
    await this.consumeReservations(tx, orderId);
    const payment = await tx.payment.findFirstOrThrow({ where: { orderId, status: 'PENDING' } });
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'SUCCEEDED', paidAt: now, providerReference },
    });
    // Any other attempt still open is superseded by the one that paid.
    await tx.paymentAttempt.updateMany({
      where: {
        paymentId: payment.id,
        status: { in: ['INITIATED', 'PENDING'] },
        ...(attemptId ? { id: { not: attemptId } } : {}),
      },
      data: attemptId
        ? { status: 'CANCELLED', completedAt: now }
        : { status: 'SUCCEEDED', completedAt: now, providerReference },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        field: 'PAYMENT',
        fromStatus: 'PENDING',
        toStatus: 'PAID',
        note: providerReference ? `Payment received (${providerReference})` : 'Payment received',
      },
    });
    return true;
  }

  /** Payment failed, was cancelled or timed out: release held stock and cancel the order. Idempotent. */
  async markFailed(
    orderId: string,
    reason: 'PAYMENT_FAILED' | 'PAYMENT_TIMEOUT',
    note: string,
  ): Promise<boolean> {
    const changed = await this.prisma.client.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.order.updateMany({
        where: { id: orderId, paymentStatus: 'PENDING' },
        data: {
          paymentStatus: 'FAILED',
          fulfillmentStatus: 'CANCELLED',
          cancelledAt: now,
          cancelReason: reason,
        },
      });
      if (claimed.count !== 1) return false;
      await this.releaseReservations(tx, orderId);
      await releaseCouponRedemption(tx, orderId);
      const status = reason === 'PAYMENT_TIMEOUT' ? 'CANCELLED' : 'FAILED';
      await tx.payment.updateMany({ where: { orderId, status: 'PENDING' }, data: { status } });
      await tx.paymentAttempt.updateMany({
        where: { payment: { orderId }, status: { in: ['INITIATED', 'PENDING'] } },
        data: { status: reason === 'PAYMENT_TIMEOUT' ? 'TIMED_OUT' : 'FAILED', completedAt: now },
      });
      await tx.orderStatusHistory.createMany({
        data: [
          { orderId, field: 'PAYMENT', fromStatus: 'PENDING', toStatus: 'FAILED', note },
          { orderId, field: 'FULFILLMENT', fromStatus: 'PENDING', toStatus: 'CANCELLED', note },
        ],
      });
      return true;
    }, TX);

    if (changed) await this.notifyChange(orderId, 'cancelled', note);
    return changed;
  }

  /** Cancel orders whose payment window has passed. Called every minute by the worker. */
  async releaseExpired(now = new Date()): Promise<number> {
    const expired = await this.prisma.client.order.findMany({
      where: {
        paymentStatus: 'PENDING',
        reservations: { some: { status: 'ACTIVE', expiresAt: { lte: now } } },
        // Never cancel while the customer may still be completing an M-Pesa prompt.
        payments: {
          none: {
            attempts: {
              some: { status: { in: ['INITIATED', 'PENDING'] }, expiresAt: { gt: now } },
            },
          },
        },
      },
      select: { id: true },
      take: 100,
    });
    let released = 0;
    for (const { id } of expired) {
      try {
        if (
          await this.markFailed(
            id,
            'PAYMENT_TIMEOUT',
            'Payment was not received in time, so the order was cancelled and the items released.',
          )
        ) {
          released++;
        }
      } catch (error) {
        this.logger.error(`Could not release order ${id}: ${(error as Error).message}`);
      }
    }
    return released;
  }

  /** Cash on delivery and confirmed payments: held stock becomes a sale (inside the caller's transaction). */
  async consumeReservations(tx: Tx, orderId: string): Promise<void> {
    const reservations = await tx.stockReservation.findMany({
      where: { orderId, status: 'ACTIVE' },
      orderBy: { variantId: 'asc' },
    });
    for (const r of reservations) {
      const rows = await tx.$queryRaw<{ onHand: number; reserved: number }[]>(Prisma.sql`
        UPDATE inventory SET "onHand" = "onHand" - ${r.quantity}, reserved = reserved - ${r.quantity}
        WHERE "variantId" = ${r.variantId}::uuid AND reserved >= ${r.quantity} AND "onHand" >= ${r.quantity}
        RETURNING "onHand", reserved`);
      const after = rows[0];
      if (!after)
        throw new Error(`Inventory for variant ${r.variantId} does not cover reservation ${r.id}`);
      await tx.stockReservation.update({
        where: { id: r.id },
        data: { status: 'CONSUMED', consumedAt: new Date() },
      });
      await tx.inventoryMovement.create({
        data: {
          variantId: r.variantId,
          delta: -r.quantity,
          reason: 'SALE',
          onHandAfter: after.onHand,
          reservedAfter: after.reserved,
          orderId,
        },
      });
      const variant = await tx.productVariant.findUniqueOrThrow({
        where: { id: r.variantId },
        select: { productId: true },
      });
      await tx.product.update({
        where: { id: variant.productId },
        data: { salesCount: { increment: r.quantity } },
      });
    }
  }

  /** Returns held units to sale (inside the caller's transaction). */
  async releaseReservations(tx: Tx, orderId: string): Promise<void> {
    const reservations = await tx.stockReservation.findMany({
      where: { orderId, status: 'ACTIVE' },
      orderBy: { variantId: 'asc' },
    });
    for (const r of reservations) {
      const rows = await tx.$queryRaw<{ onHand: number; reserved: number }[]>(Prisma.sql`
        UPDATE inventory SET reserved = reserved - ${r.quantity}
        WHERE "variantId" = ${r.variantId}::uuid AND reserved >= ${r.quantity}
        RETURNING "onHand", reserved`);
      const after = rows[0];
      if (!after)
        throw new Error(`Inventory for variant ${r.variantId} does not cover reservation ${r.id}`);
      await tx.stockReservation.update({
        where: { id: r.id },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
      // For reservation movements, delta is the change in reserved units.
      await tx.inventoryMovement.create({
        data: {
          variantId: r.variantId,
          delta: -r.quantity,
          reason: 'RESERVATION_RELEASE',
          onHandAfter: after.onHand,
          reservedAfter: after.reserved,
          orderId,
        },
      });
    }
  }

  /** Refreshes storefront stock and emails the customer after a committed change. */
  async notifyChange(orderId: string, outcome: 'paid' | 'cancelled', note?: string): Promise<void> {
    const order = await this.prisma.client.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: { include: { product: { select: { slug: true } } } } },
    });
    await this.stock.stockChanged(
      order.items.map((i) => i.product?.slug).filter((s): s is string => Boolean(s)),
    );
    const data: OrderEmailData = {
      orderNumber: order.orderNumber,
      totalMinor: order.totalMinor,
      lines: order.items.map((i) => ({
        name: `${i.productName} (${i.variantName})`,
        quantity: i.quantity,
      })),
      trackUrl: `${this.storefrontUrl}/track-order/${order.trackingToken}`,
    };
    await this.mail.send(
      outcome === 'paid'
        ? emails.paymentReceived(order.email, data)
        : emails.orderCancelled(order.email, data, note ?? ''),
    );
  }
}
