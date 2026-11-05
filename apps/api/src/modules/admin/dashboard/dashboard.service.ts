import { Injectable } from '@nestjs/common';
import { Prisma } from '@repo/database';
import type { DashboardRange, DashboardSummary, FulfillmentStatus } from '@repo/shared-types';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { toAdminSummary } from '../orders/admin-orders.service.js';

const DAYS: Record<DashboardRange, number> = { '7d': 7, '30d': 30, '90d': 90 };
const TZ = 'Africa/Nairobi';
const DAY_MS = 86_400_000;

/** Midnight in Nairobi (UTC+3, no daylight saving) at the start of the day containing `at`. */
function nairobiMidnight(at: Date): Date {
  const local = new Date(at.getTime() + 3 * 3_600_000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 3 * 3_600_000,
  );
}

/**
 * Store figures, all from live queries. Revenue is what was paid in the period (by payment date)
 * less refunds already sent on those payments, so it matches money actually kept.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(range: DashboardRange, now = new Date()): Promise<DashboardSummary> {
    const days = DAYS[range];
    const to = now;
    const from = new Date(nairobiMidnight(now).getTime() - (days - 1) * DAY_MS);
    const previousFrom = new Date(from.getTime() - days * DAY_MS);
    const db = this.prisma.client;

    const [current, previous, daily, top, byStatus, newCustomers, counts, stock, recent] =
      await Promise.all([
        this.revenue(from, to),
        this.revenue(previousFrom, from),
        db.$queryRaw<{ day: string; revenue: bigint | null; orders: bigint }[]>(Prisma.sql`
          WITH days AS (
            SELECT generate_series(
              (${from}::timestamptz AT TIME ZONE ${TZ})::date,
              (${to}::timestamptz AT TIME ZONE ${TZ})::date,
              interval '1 day')::date AS day
          ), paid AS (
            SELECT (o."paidAt" AT TIME ZONE ${TZ})::date AS day,
              o."totalMinor" - COALESCE(p."refundedMinor", 0) AS net
            FROM orders o
            LEFT JOIN payments p ON p."orderId" = o.id AND p."paidAt" IS NOT NULL
            WHERE o."paidAt" >= ${from} AND o."paidAt" < ${to}
          )
          SELECT to_char(d.day, 'YYYY-MM-DD') AS day, SUM(paid.net) AS revenue, COUNT(paid.day) AS orders
          FROM days d LEFT JOIN paid ON paid.day = d.day
          GROUP BY d.day ORDER BY d.day`),
        db.$queryRaw<
          { productId: string; name: string; units: bigint; revenue: bigint }[]
        >(Prisma.sql`
          SELECT i."productId", MIN(i."productName") AS name, SUM(i.quantity) AS units,
            SUM(i."lineTotalMinor") AS revenue
          FROM order_items i JOIN orders o ON o.id = i."orderId"
          WHERE o."paidAt" >= ${from} AND o."paidAt" < ${to} AND i."productId" IS NOT NULL
          GROUP BY i."productId" ORDER BY units DESC, revenue DESC LIMIT 5`),
        db.order.groupBy({
          by: ['fulfillmentStatus'],
          where: { placedAt: { gte: from, lt: to } },
          _count: { _all: true },
        }),
        db.user.count({ where: { type: 'CUSTOMER', createdAt: { gte: from, lt: to } } }),
        Promise.all([
          db.order.count({ where: { paymentStatus: 'PENDING' } }),
          // Ready for staff: paid (or cash on delivery) and not yet shipped.
          db.order.count({
            where: {
              fulfillmentStatus: { in: ['PENDING', 'PROCESSING', 'PACKED'] },
              OR: [
                { paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] } },
                { paymentProvider: 'CASH_ON_DELIVERY', paymentStatus: 'UNPAID' },
              ],
            },
          }),
          db.refund.count({ where: { status: { in: ['REQUESTED', 'APPROVED', 'PROCESSING'] } } }),
        ]),
        db.$queryRaw<{ low: bigint; out: bigint }[]>(Prisma.sql`
          SELECT
            COUNT(*) FILTER (WHERE i."onHand" - i.reserved > 0 AND i."onHand" - i.reserved <= i."lowStockThreshold") AS low,
            COUNT(*) FILTER (WHERE i."onHand" - i.reserved <= 0) AS out
          FROM inventory i
          JOIN product_variants v ON v.id = i."variantId" AND v."isActive"
          JOIN products p ON p.id = v."productId" AND p.status = 'PUBLISHED'`),
        db.order.findMany({
          orderBy: { placedAt: 'desc' },
          take: 8,
          include: { items: { select: { quantity: true } } },
        }),
      ]);

    const ordersByStatus = Object.fromEntries(
      (
        [
          'PENDING',
          'PROCESSING',
          'PACKED',
          'SHIPPED',
          'DELIVERED',
          'CANCELLED',
        ] as FulfillmentStatus[]
      ).map((s) => [s, byStatus.find((b) => b.fulfillmentStatus === s)?._count._all ?? 0]),
    ) as Record<FulfillmentStatus, number>;
    const [awaitingPayment, toFulfil, openRefunds] = counts;

    return {
      range,
      from: from.toISOString(),
      to: to.toISOString(),
      revenueMinor: current.revenue,
      previousRevenueMinor: previous.revenue,
      paidOrders: current.orders,
      previousPaidOrders: previous.orders,
      averageOrderMinor: current.orders ? Math.round(current.revenue / current.orders) : 0,
      newCustomers,
      awaitingPayment,
      toFulfil,
      lowStock: Number(stock[0]?.low ?? 0),
      outOfStock: Number(stock[0]?.out ?? 0),
      openRefunds,
      daily: daily.map((d) => ({
        date: d.day,
        revenueMinor: Number(d.revenue ?? 0),
        orders: Number(d.orders),
      })),
      topProducts: top.map((t) => ({
        productId: t.productId,
        name: t.name,
        units: Number(t.units),
        revenueMinor: Number(t.revenue),
      })),
      ordersByStatus,
      recentOrders: recent.map(toAdminSummary),
    };
  }

  private async revenue(from: Date, to: Date): Promise<{ revenue: number; orders: number }> {
    const [row] = await this.prisma.client.$queryRaw<
      { revenue: bigint | null; orders: bigint }[]
    >(Prisma.sql`
      SELECT SUM(o."totalMinor" - COALESCE(p."refundedMinor", 0)) AS revenue, COUNT(*) AS orders
      FROM orders o
      LEFT JOIN payments p ON p."orderId" = o.id AND p."paidAt" IS NOT NULL
      WHERE o."paidAt" >= ${from} AND o."paidAt" < ${to}`);
    return { revenue: Number(row?.revenue ?? 0), orders: Number(row?.orders ?? 0) };
  }
}
