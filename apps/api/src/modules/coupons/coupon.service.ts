import { Injectable } from '@nestjs/common';
import { Prisma } from '@repo/database';
import { formatKesPlain } from './format.js';
import { couponDiscount } from './coupon-math.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

type Db = Prisma.TransactionClient | PrismaService['client'];
type CouponRow = Prisma.CouponGetPayload<object>;

export type CouponCheck =
  { ok: true; coupon: CouponRow; discountMinor: number } | { ok: false; reason: string };

export interface CouponContext {
  subtotalMinor: number;
  userId: string | null;
  /** Unknown while a guest is still filling in checkout; per-customer rules then wait for placement. */
  email: string | null;
  now?: Date;
}

/**
 * Coupon rules, applied on the server only. The storefront shows the result; the order is priced
 * again (with the coupon row locked) when it is placed.
 */
@Injectable()
export class CouponService {
  constructor(private readonly prisma: PrismaService) {}

  async check(code: string, ctx: CouponContext, db: Db = this.prisma.client): Promise<CouponCheck> {
    const coupon = await db.coupon.findUnique({ where: { code } });
    return this.evaluate(coupon, ctx, db);
  }

  /** Inside the order transaction: locks the coupon so limits hold under concurrent checkouts. */
  async checkForUpdate(
    code: string,
    ctx: CouponContext,
    tx: Prisma.TransactionClient,
  ): Promise<CouponCheck> {
    const locked = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM coupons WHERE code = ${code}::citext FOR UPDATE`,
    );
    const coupon = locked[0] ? await tx.coupon.findUnique({ where: { id: locked[0].id } }) : null;
    return this.evaluate(coupon, ctx, tx);
  }

  /** Records the use (inside the order transaction, after checkForUpdate). */
  async redeem(
    tx: Prisma.TransactionClient,
    couponId: string,
    order: { id: string; userId: string | null; email: string },
    discountMinor: number,
  ): Promise<void> {
    await tx.couponRedemption.create({
      data: {
        couponId,
        orderId: order.id,
        userId: order.userId,
        email: order.email,
        discountMinor,
      },
    });
    await tx.coupon.update({
      where: { id: couponId },
      data: { redemptionCount: { increment: 1 } },
    });
  }

  private async evaluate(
    coupon: CouponRow | null,
    ctx: CouponContext,
    db: Db,
  ): Promise<CouponCheck> {
    const now = ctx.now ?? new Date();
    if (!coupon || !coupon.isActive) return { ok: false, reason: "That code isn't valid." };
    if (coupon.startsAt && coupon.startsAt > now)
      return { ok: false, reason: "That code isn't active yet." };
    if (coupon.endsAt && coupon.endsAt <= now)
      return { ok: false, reason: 'That code has expired.' };
    if (ctx.subtotalMinor < coupon.minOrderMinor)
      return {
        ok: false,
        reason: `Spend at least ${formatKesPlain(coupon.minOrderMinor)} to use this code.`,
      };
    if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions)
      return { ok: false, reason: 'That code has been fully used.' };

    const who = this.customerFilter(ctx);
    if (who && coupon.maxPerCustomer !== null) {
      const used = await db.couponRedemption.count({ where: { couponId: coupon.id, OR: who } });
      if (used >= coupon.maxPerCustomer)
        return { ok: false, reason: "You've already used this code." };
    }
    if (who && coupon.firstOrderOnly) {
      const previous = await db.order.count({
        where: { OR: who, fulfillmentStatus: { not: 'CANCELLED' } },
      });
      if (previous > 0) return { ok: false, reason: 'This code is for first orders only.' };
    }
    const discountMinor = couponDiscount(coupon, ctx.subtotalMinor);
    if (discountMinor <= 0) return { ok: false, reason: "That code doesn't reduce this order." };
    return { ok: true, coupon, discountMinor };
  }

  private customerFilter(
    ctx: CouponContext,
  ): (Prisma.CouponRedemptionWhereInput[] & Prisma.OrderWhereInput[]) | null {
    const filters: { userId?: string; email?: string }[] = [];
    if (ctx.userId) filters.push({ userId: ctx.userId });
    if (ctx.email) filters.push({ email: ctx.email });
    return filters.length ? (filters as never) : null;
  }
}

/** Gives a coupon use back when its order is cancelled (inside the caller's transaction). */
export async function releaseCouponRedemption(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const redemption = await tx.couponRedemption.findUnique({ where: { orderId } });
  if (!redemption) return;
  await tx.couponRedemption.delete({ where: { id: redemption.id } });
  await tx.coupon.update({
    where: { id: redemption.couponId },
    data: { redemptionCount: { decrement: 1 } },
  });
}
