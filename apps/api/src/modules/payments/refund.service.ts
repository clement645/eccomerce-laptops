import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@repo/database';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 10_000, timeout: 30_000 } as const;
const OPEN_REFUND = ['REQUESTED', 'APPROVED', 'PROCESSING'] as const;
/** Staff emails for display alongside a refund. */
const withStaff = {
  requestedBy: { select: { email: true } },
  approvedBy: { select: { email: true } },
} satisfies Prisma.RefundInclude;

export interface RefundRequest {
  paymentId: string;
  amountMinor: number;
  reason: string;
  /** Staff member asking for it, or null when the system raises it (e.g. a late payment). */
  requestedById: string | null;
}

/**
 * Refund bookkeeping. M-Pesa reversals are sent outside the platform for now (they need Safaricom
 * initiator credentials). Staff record the result here, which keeps payment and order totals honest.
 * Requests and completions are separate steps, and a staff member cannot complete their own request.
 */
@Injectable()
export class RefundService {
  constructor(private readonly prisma: PrismaService) {}

  request(input: RefundRequest) {
    return this.prisma.client.$transaction((tx) => this.requestTx(tx, input), TX);
  }

  /** Raises a refund inside the caller's transaction. The payment row is locked first, so totals cannot race. */
  async requestTx(tx: Tx, input: RefundRequest) {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0)
      throw new UnprocessableEntityException({
        code: 'INVALID_AMOUNT',
        message: 'Refund amount must be a positive number of cents',
      });
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM payments WHERE id = ${input.paymentId}::uuid FOR UPDATE`,
    );
    const payment = await tx.payment.findUnique({
      where: { id: input.paymentId },
      include: { refunds: { where: { status: { in: [...OPEN_REFUND] } } } },
    });
    if (!payment) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payment not found' });
    if (payment.status !== 'SUCCEEDED' && payment.status !== 'PARTIALLY_REFUNDED')
      throw new ConflictException({
        code: 'PAYMENT_NOT_REFUNDABLE',
        message: 'Only received payments can be refunded',
      });
    const open = payment.refunds.reduce((sum, r) => sum + r.amountMinor, 0);
    const available = payment.amountMinor - payment.refundedMinor - open;
    if (input.amountMinor > available)
      throw new UnprocessableEntityException({
        code: 'REFUND_EXCEEDS_PAYMENT',
        message: 'The refund is more than the amount left to refund',
        details: { availableMinor: Math.max(0, available) },
      });
    return tx.refund.create({
      include: withStaff,
      data: {
        paymentId: payment.id,
        amountMinor: input.amountMinor,
        reason: input.reason,
        requestedById: input.requestedById,
      },
    });
  }

  /** Records a refund that has been paid back to the customer. */
  async complete(refundId: string, actorId: string, providerReference: string) {
    return this.prisma.client.$transaction(async (tx) => {
      const refund = await this.openRefund(tx, refundId);
      if (refund.requestedById && refund.requestedById === actorId)
        throw new ForbiddenException({
          code: 'SEPARATION_OF_DUTIES',
          message: 'A different staff member must complete a refund you requested',
        });
      const claimed = await tx.refund.updateMany({
        where: { id: refundId, status: { in: [...OPEN_REFUND] } },
        data: {
          status: 'SUCCEEDED',
          approvedById: actorId,
          providerReference,
          processedAt: new Date(),
        },
      });
      if (claimed.count !== 1) throw this.notOpen();

      const rows = await tx.$queryRaw<
        { amountMinor: number; refundedMinor: number; orderId: string; paidAt: Date | null }[]
      >(Prisma.sql`
        UPDATE payments SET "refundedMinor" = "refundedMinor" + ${refund.amountMinor},
          status = (CASE WHEN "refundedMinor" + ${refund.amountMinor} >= "amountMinor"
            THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END)::"PaymentRecordStatus",
          "updatedAt" = now()
        WHERE id = ${refund.paymentId}::uuid AND "refundedMinor" + ${refund.amountMinor} <= "amountMinor"
        RETURNING "amountMinor", "refundedMinor", "orderId", "paidAt"`);
      const payment = rows[0];
      if (!payment) throw new Error(`Refund ${refundId} exceeds payment ${refund.paymentId}`);

      // Only the payment that settled the order changes the order's payment status.
      if (payment.paidAt) {
        const status =
          payment.refundedMinor >= payment.amountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
        const order = await tx.order.findUniqueOrThrow({
          where: { id: payment.orderId },
          select: { paymentStatus: true },
        });
        if (order.paymentStatus !== status) {
          await tx.order.update({
            where: { id: payment.orderId },
            data: { paymentStatus: status },
          });
          await tx.orderStatusHistory.create({
            data: {
              orderId: payment.orderId,
              field: 'PAYMENT',
              fromStatus: order.paymentStatus,
              toStatus: status,
              note: 'Refund sent',
              actorId,
            },
          });
        }
      }
      return tx.refund.findUniqueOrThrow({ where: { id: refundId }, include: withStaff });
    }, TX);
  }

  async reject(refundId: string, actorId: string) {
    const claimed = await this.prisma.client.refund.updateMany({
      where: { id: refundId, status: { in: [...OPEN_REFUND] } },
      data: { status: 'REJECTED', approvedById: actorId, processedAt: new Date() },
    });
    if (claimed.count !== 1) {
      await this.openRefund(this.prisma.client, refundId);
      throw this.notOpen();
    }
    return this.prisma.client.refund.findUniqueOrThrow({
      where: { id: refundId },
      include: withStaff,
    });
  }

  private async openRefund(tx: Tx | PrismaService['client'], refundId: string) {
    const refund = await tx.refund.findUnique({ where: { id: refundId } });
    if (!refund) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Refund not found' });
    if (!(OPEN_REFUND as readonly string[]).includes(refund.status)) throw this.notOpen();
    return refund;
  }

  private notOpen() {
    return new ConflictException({
      code: 'REFUND_CLOSED',
      message: 'This refund has already been completed or rejected',
    });
  }
}
