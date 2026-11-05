import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import type { Prisma } from '@repo/database';
import type { AdminContactMessage, ContactStatus, Paginated } from '@repo/shared-types';
import type { AdminListQuery, ContactMessageInput } from '@repo/validation';
import { API_ENV } from '../../config/env.js';
import { MailService } from '../../infrastructure/mail/mail.service.js';
import { emails } from '../../infrastructure/mail/templates.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { notFound } from '../admin/admin-errors.js';

/**
 * Contact form. Messages are stored and forwarded to the store's contact address (Store settings).
 * No automatic reply goes to the address typed in the form, so it cannot be used to send email to
 * strangers. Submissions that fill the hidden "website" field are kept as spam, silently.
 */
@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  private readonly adminUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.adminUrl = env.ADMIN_URL.replace(/\/$/, '');
  }

  async submit(input: ContactMessageInput): Promise<void> {
    const spam = Boolean(input.website?.trim());
    const saved = await this.prisma.client.contactMessage.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        subject: input.subject,
        message: input.message,
        status: spam ? 'SPAM' : 'NEW',
      },
    });
    if (spam) return;
    const setting = await this.prisma.client.storeSetting.findUnique({
      where: { key: 'store.contact' },
    });
    const inbox = (setting?.value as { email?: string | null } | null)?.email;
    if (!inbox) {
      this.logger.warn('Contact message saved, but no store contact email is set to forward it to');
      return;
    }
    await this.mail.send(
      emails.contactNotification(inbox, {
        name: saved.name,
        email: saved.email,
        phone: saved.phone,
        subject: saved.subject,
        message: saved.message,
        adminUrl: `${this.adminUrl}/messages`,
      }),
    );
  }

  async adminList(
    query: AdminListQuery,
  ): Promise<Paginated<AdminContactMessage> & { counts: Record<string, number> }> {
    const status = ['NEW', 'IN_PROGRESS', 'RESOLVED', 'SPAM'].includes(query.status ?? '')
      ? (query.status as ContactStatus)
      : undefined;
    const where: Prisma.ContactMessageWhereInput = {
      // Spam is hidden unless asked for.
      status: status ?? { not: 'SPAM' },
      ...(query.q
        ? {
            OR: [
              { email: { contains: query.q.toLowerCase() } },
              { name: { contains: query.q, mode: 'insensitive' } },
              { subject: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows, groups] = await Promise.all([
      this.prisma.client.contactMessage.count({ where }),
      this.prisma.client.contactMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { handledBy: { select: { email: true } } },
      }),
      this.prisma.client.contactMessage.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
      items: rows.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        phone: m.phone,
        subject: m.subject,
        message: m.message,
        status: m.status,
        handledBy: m.handledBy?.email ?? null,
        createdAt: m.createdAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      counts: Object.fromEntries(groups.map((g) => [g.status, g._count._all])),
    };
  }

  async setStatus(id: string, status: ContactStatus, actorId: string): Promise<void> {
    const updated = await this.prisma.client.contactMessage.updateMany({
      where: { id },
      data: { status, handledById: actorId },
    });
    if (updated.count !== 1) throw notFound('Message');
  }
}
