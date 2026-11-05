import type { Prisma } from '@repo/database';
import type { AdminPayment, AdminRefund } from '@repo/shared-types';

const withStaff = {
  requestedBy: { select: { email: true } },
  approvedBy: { select: { email: true } },
} satisfies Prisma.RefundInclude;

/** Payments with attempts and refunds, oldest first (the first is the one created at checkout). */
export const adminPaymentsInclude = {
  orderBy: { createdAt: 'asc' },
  include: {
    attempts: { orderBy: { createdAt: 'asc' } },
    refunds: { orderBy: { createdAt: 'asc' }, include: withStaff },
  },
} satisfies Prisma.Order$paymentsArgs;

type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof adminPaymentsInclude.include }>;
type RefundRow = Prisma.RefundGetPayload<{ include: typeof withStaff }>;

export function toAdminRefund(r: RefundRow): AdminRefund {
  return {
    id: r.id,
    paymentId: r.paymentId,
    amountMinor: r.amountMinor,
    reason: r.reason,
    status: r.status,
    providerReference: r.providerReference,
    requestedBy: r.requestedBy?.email ?? null,
    approvedBy: r.approvedBy?.email ?? null,
    createdAt: r.createdAt.toISOString(),
    processedAt: r.processedAt?.toISOString() ?? null,
  };
}

export function toAdminPayment(p: PaymentRow): AdminPayment {
  return {
    id: p.id,
    provider: p.provider,
    status: p.status,
    amountMinor: p.amountMinor,
    refundedMinor: p.refundedMinor,
    providerReference: p.providerReference,
    paidAt: p.paidAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    attempts: p.attempts.map((a) => ({
      id: a.id,
      status: a.status,
      amountMinor: a.amountMinor,
      phoneMasked: a.phoneMasked,
      checkoutRequestId: a.checkoutRequestId,
      resultCode: a.resultCode,
      resultDesc: a.resultDesc,
      providerReference: a.providerReference,
      createdAt: a.createdAt.toISOString(),
      completedAt: a.completedAt?.toISOString() ?? null,
    })),
    refunds: p.refunds.map(toAdminRefund),
  };
}
