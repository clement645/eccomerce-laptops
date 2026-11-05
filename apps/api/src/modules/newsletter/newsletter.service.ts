import { createHmac } from 'node:crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import type { Prisma } from '@repo/database';
import type { AdminSubscriber, Paginated } from '@repo/shared-types';
import type { AdminListQuery } from '@repo/validation';
import { API_ENV } from '../../config/env.js';
import { MailService } from '../../infrastructure/mail/mail.service.js';
import { emails } from '../../infrastructure/mail/templates.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { hashToken, randomToken } from '../auth/crypto/tokens.js';

const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Don't send another confirmation to the same address more often than this. */
const RESEND_AFTER_MS = 2 * 60 * 1000;

const invalidLink = () =>
  new BadRequestException({
    code: 'INVALID_TOKEN',
    message: 'This link is invalid or has expired',
  });

/**
 * Double opt-in newsletter. Nobody is subscribed until they click the emailed link, and the API
 * answers the same way whatever the address's state, so the form cannot be used to discover who
 * is subscribed. Every email carries a one-click unsubscribe link.
 */
@Injectable()
export class NewsletterService {
  private readonly storefrontUrl: string;
  private readonly unsubscribeKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.storefrontUrl = env.STOREFRONT_URL.replace(/\/$/, '');
    this.unsubscribeKey = env.JWT_ACCESS_SECRET;
  }

  async subscribe(email: string, source: string | undefined): Promise<void> {
    const existing = await this.prisma.client.newsletterSubscriber.findUnique({ where: { email } });
    if (existing?.status === 'SUBSCRIBED') return;
    if (
      existing?.status === 'PENDING' &&
      Date.now() - existing.updatedAt.getTime() < RESEND_AFTER_MS
    )
      return;

    const confirm = randomToken();
    const subscriber = existing
      ? await this.prisma.client.newsletterSubscriber.update({
          where: { id: existing.id },
          data: {
            status: 'PENDING',
            confirmTokenHash: hashToken(confirm),
            consentAt: new Date(),
            source: source ?? existing.source,
          },
        })
      : await this.prisma.client.newsletterSubscriber.create({
          data: {
            email,
            source: source ?? null,
            confirmTokenHash: hashToken(confirm),
            // Replaced right below once the id (which the token is derived from) exists.
            unsubscribeTokenHash: hashToken(randomToken()),
          },
        });
    if (!existing)
      await this.prisma.client.newsletterSubscriber.update({
        where: { id: subscriber.id },
        data: { unsubscribeTokenHash: hashToken(this.unsubscribeToken(subscriber.id)) },
      });
    await this.mail.send(
      emails.newsletterConfirm(email, `${this.storefrontUrl}/newsletter/confirm?token=${confirm}`),
    );
  }

  async confirm(token: string): Promise<void> {
    const subscriber = await this.prisma.client.newsletterSubscriber.findUnique({
      where: { confirmTokenHash: hashToken(token) },
    });
    if (
      !subscriber ||
      subscriber.status !== 'PENDING' ||
      Date.now() - subscriber.consentAt.getTime() > CONFIRM_TTL_MS
    )
      throw invalidLink();
    const claimed = await this.prisma.client.newsletterSubscriber.updateMany({
      where: { id: subscriber.id, status: 'PENDING', confirmTokenHash: hashToken(token) },
      data: {
        status: 'SUBSCRIBED',
        confirmedAt: new Date(),
        confirmTokenHash: null,
        unsubscribedAt: null,
      },
    });
    if (claimed.count !== 1) throw invalidLink();
    await this.mail.send(
      emails.newsletterWelcome(subscriber.email, this.unsubscribeUrl(subscriber.id)),
    );
  }

  /** One click, no sign-in. Unsubscribing twice is fine. */
  async unsubscribe(token: string): Promise<void> {
    const updated = await this.prisma.client.newsletterSubscriber.updateMany({
      where: { unsubscribeTokenHash: hashToken(token) },
      data: { status: 'UNSUBSCRIBED', unsubscribedAt: new Date(), confirmTokenHash: null },
    });
    if (updated.count !== 1) throw invalidLink();
  }

  /** Link for the footer of every newsletter email. */
  unsubscribeUrl(subscriberId: string): string {
    return `${this.storefrontUrl}/newsletter/unsubscribe?token=${this.unsubscribeToken(subscriberId)}`;
  }

  async adminList(
    query: AdminListQuery,
  ): Promise<Paginated<AdminSubscriber> & { counts: Record<string, number> }> {
    const status = ['PENDING', 'SUBSCRIBED', 'UNSUBSCRIBED'].includes(query.status ?? '')
      ? (query.status as AdminSubscriber['status'])
      : undefined;
    const where: Prisma.NewsletterSubscriberWhereInput = {
      ...(status ? { status } : {}),
      ...(query.q ? { email: { contains: query.q.toLowerCase() } } : {}),
    };
    const [total, rows, groups] = await Promise.all([
      this.prisma.client.newsletterSubscriber.count({ where }),
      this.prisma.client.newsletterSubscriber.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.client.newsletterSubscriber.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
      items: rows.map((s) => ({
        id: s.id,
        email: s.email,
        status: s.status,
        source: s.source,
        consentAt: s.consentAt.toISOString(),
        confirmedAt: s.confirmedAt?.toISOString() ?? null,
        unsubscribedAt: s.unsubscribedAt?.toISOString() ?? null,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      counts: Object.fromEntries(groups.map((g) => [g.status, g._count._all])),
    };
  }

  /** Confirmed subscribers with their unsubscribe links, for the sending tool. */
  async exportCsv(): Promise<string> {
    const rows = await this.prisma.client.newsletterSubscriber.findMany({
      where: { status: 'SUBSCRIBED' },
      orderBy: { confirmedAt: 'asc' },
    });
    const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    return [
      'email,confirmed_at,unsubscribe_url',
      ...rows.map((s) =>
        [s.email, s.confirmedAt?.toISOString() ?? '', this.unsubscribeUrl(s.id)]
          .map(cell)
          .join(','),
      ),
    ].join('\n');
  }

  /** Stable per subscriber, so links in old emails keep working. Derived, never stored. */
  private unsubscribeToken(subscriberId: string): string {
    return createHmac('sha256', this.unsubscribeKey)
      .update(`newsletter-unsubscribe:${subscriberId}`)
      .digest('base64url');
  }
}
