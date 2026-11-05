import { Injectable } from '@nestjs/common';
import { Prisma } from '@repo/database';
import type { AdminCustomerDetail, AdminCustomerSummary, Paginated } from '@repo/shared-types';
import type { CustomerListQuery } from '@repo/validation';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { SessionService } from '../../auth/session.service.js';
import { notFound } from '../admin-errors.js';
import { toAdminSummary } from '../orders/admin-orders.service.js';

const PAID = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;

type CustomerRow = Prisma.UserGetPayload<{ include: { profile: true } }>;

@Injectable()
export class AdminCustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  async list(query: CustomerListQuery): Promise<Paginated<AdminCustomerSummary>> {
    const where: Prisma.UserWhereInput = {
      type: 'CUSTOMER',
      status: query.status ?? { not: 'DELETED' },
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q.toLowerCase() } },
              { profile: { firstName: { contains: query.q, mode: 'insensitive' } } },
              { profile: { lastName: { contains: query.q, mode: 'insensitive' } } },
              { profile: { phone: { contains: query.q.replace(/\D/g, '') || query.q } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.client.user.count({ where }),
      this.prisma.client.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { profile: true },
      }),
    ]);
    const stats = await this.stats(rows.map((r) => r.id));
    return {
      items: rows.map((r) => this.summary(r, stats.get(r.id))),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async detail(id: string): Promise<AdminCustomerDetail> {
    const user = await this.prisma.client.user.findFirst({
      where: { id, type: 'CUSTOMER' },
      include: {
        profile: true,
        addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] },
        orders: {
          orderBy: { placedAt: 'desc' },
          take: 50,
          include: { items: { select: { quantity: true } } },
        },
      },
    });
    if (!user) throw notFound('Customer');
    const stats = await this.stats([user.id]);
    return {
      ...this.summary(user, stats.get(user.id)),
      marketingOptIn: user.profile?.marketingOptIn ?? false,
      addresses: user.addresses.map((a) => ({
        id: a.id,
        label: a.label,
        recipientName: a.recipientName,
        phone: a.phone,
        county: a.county,
        town: a.town,
        street: a.street,
        isDefault: a.isDefault,
      })),
      orders: user.orders.map(toAdminSummary),
    };
  }

  /** Suspending signs the customer out everywhere; sign-in is refused until reactivated. */
  async setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<AdminCustomerDetail> {
    const updated = await this.prisma.client.user.updateMany({
      where: { id, type: 'CUSTOMER', status: { not: 'DELETED' } },
      data: { status },
    });
    if (updated.count !== 1) throw notFound('Customer');
    if (status === 'SUSPENDED') await this.sessions.revokeAllForUser(id, 'suspended');
    return this.detail(id);
  }

  private async stats(userIds: string[]) {
    if (userIds.length === 0)
      return new Map<string, { count: number; spent: number; last: Date | null }>();
    const [all, paid] = await Promise.all([
      this.prisma.client.order.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds } },
        _count: { _all: true },
        _max: { placedAt: true },
      }),
      this.prisma.client.order.groupBy({
        by: ['userId'],
        where: { userId: { in: userIds }, paymentStatus: { in: [...PAID] } },
        _sum: { totalMinor: true },
      }),
    ]);
    const spent = new Map(paid.map((p) => [p.userId, p._sum.totalMinor ?? 0]));
    return new Map(
      all.map((a) => [
        a.userId!,
        { count: a._count._all, spent: spent.get(a.userId) ?? 0, last: a._max.placedAt },
      ]),
    );
  }

  private summary(
    user: CustomerRow,
    stats: { count: number; spent: number; last: Date | null } | undefined,
  ): AdminCustomerSummary {
    return {
      id: user.id,
      email: user.email,
      name: user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.email,
      phone: user.profile?.phone ?? null,
      status: user.status,
      emailVerified: user.emailVerifiedAt !== null,
      orderCount: stats?.count ?? 0,
      totalSpentMinor: stats?.spent ?? 0,
      lastOrderAt: stats?.last?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
