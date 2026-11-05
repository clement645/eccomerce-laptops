import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Address } from '@repo/database';
import type { AddressDto, SessionInfo, SessionUser } from '@repo/shared-types';
import type { AddressInput, ChangePasswordInput, ProfileUpdateInput } from '@repo/validation';
import type { Request } from 'express';
import { MailService } from '../../infrastructure/mail/mail.service.js';
import { emails } from '../../infrastructure/mail/templates.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { hashPassword, verifyPassword } from '../auth/crypto/password.js';
import { toSessionUser } from '../auth/customer-auth.service.js';
import { SessionService } from '../auth/session.service.js';

const MAX_ADDRESSES = 10;
const notFound = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Address not found' });

function toAddressDto(a: Address): AddressDto {
  return {
    id: a.id,
    label: a.label,
    recipientName: a.recipientName,
    phone: a.phone,
    county: a.county,
    town: a.town,
    street: a.street,
    building: a.building,
    landmark: a.landmark,
    isDefault: a.isDefault,
  };
}

/** Everything here is scoped to the signed-in user; other users' records are indistinguishable from missing ones. */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  async updateProfile(
    userId: string,
    input: ProfileUpdateInput & { phone: string | null },
  ): Promise<SessionUser> {
    await this.prisma.client.customerProfile.upsert({
      where: { userId },
      create: {
        userId,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        marketingOptIn: input.marketingOptIn,
      },
      update: {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        marketingOptIn: input.marketingOptIn,
      },
    });
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: userId },
      include: { profile: true },
    });
    return toSessionUser(user);
  }

  async changePassword(
    userId: string,
    sessionId: string,
    input: ChangePasswordInput,
    request: Request,
  ): Promise<void> {
    const user = await this.prisma.client.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Some fields are invalid',
        details: [
          {
            path: 'currentPassword',
            message: 'Your current password is incorrect',
            code: 'custom',
          },
        ],
      });
    }
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });
    const current = await this.prisma.client.session.findUnique({
      where: { id: sessionId },
      select: { familyId: true },
    });
    await this.sessions.revokeAllForUser(userId, 'password_changed', current?.familyId);
    await this.mail.send(emails.passwordChanged(user.email));
    await this.audit.record({
      action: 'customer.password_changed',
      entityType: 'user',
      entityId: userId,
      actorId: userId,
      request,
    });
  }

  // ── Addresses ──────────────────────────────────────────────────────────────

  async listAddresses(userId: string): Promise<AddressDto[]> {
    const rows = await this.prisma.client.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(toAddressDto);
  }

  async createAddress(userId: string, input: AddressInput): Promise<AddressDto> {
    return this.prisma.client.$transaction(async (tx) => {
      const count = await tx.address.count({ where: { userId } });
      if (count >= MAX_ADDRESSES) {
        throw new ConflictException({
          code: 'ADDRESS_LIMIT',
          message: `You can save up to ${MAX_ADDRESSES} addresses`,
        });
      }
      const makeDefault = input.isDefault || count === 0;
      if (makeDefault)
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      const address = await tx.address.create({
        data: { ...this.addressData(input), userId, isDefault: makeDefault },
      });
      return toAddressDto(address);
    });
  }

  async updateAddress(userId: string, id: string, input: AddressInput): Promise<AddressDto> {
    return this.prisma.client.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({ where: { id, userId } });
      if (!existing) throw notFound();
      if (input.isDefault && !existing.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }
      // The default can only move to another address, never be cleared.
      const address = await tx.address.update({
        where: { id },
        data: { ...this.addressData(input), isDefault: existing.isDefault || input.isDefault },
      });
      return toAddressDto(address);
    });
  }

  async setDefaultAddress(userId: string, id: string): Promise<AddressDto> {
    return this.prisma.client.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({ where: { id, userId } });
      if (!existing) throw notFound();
      await tx.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
      return toAddressDto(await tx.address.update({ where: { id }, data: { isDefault: true } }));
    });
  }

  async deleteAddress(userId: string, id: string): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({ where: { id, userId } });
      if (!existing) throw notFound();
      await tx.address.delete({ where: { id } });
      if (existing.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
  }

  private addressData(input: AddressInput) {
    return {
      label: input.label || null,
      recipientName: input.recipientName,
      phone: input.phone,
      county: input.county,
      town: input.town,
      street: input.street,
      building: input.building || null,
      landmark: input.landmark || null,
    };
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  async listSessions(userId: string, currentSessionId: string): Promise<SessionInfo[]> {
    const current = await this.prisma.client.session.findUnique({
      where: { id: currentSessionId },
      select: { familyId: true },
    });
    const rows = await this.prisma.client.session.findMany({
      where: { userId, audience: 'STOREFRONT', revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
    // Each refresh creates a new row in the same family, so "signed in" is the family's first row.
    const started = await this.prisma.client.session.groupBy({
      by: ['familyId'],
      where: { familyId: { in: rows.map((r) => r.familyId) } },
      _min: { createdAt: true },
    });
    const startedAt = new Map(started.map((g) => [g.familyId, g._min.createdAt]));
    return rows.map((s) => ({
      id: s.id,
      createdAt: (startedAt.get(s.familyId) ?? s.createdAt).toISOString(),
      lastUsedAt: s.createdAt.toISOString(),
      userAgent: s.userAgent,
      current: s.familyId === current?.familyId,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.client.session.findFirst({
      where: { id: sessionId, userId, audience: 'STOREFRONT' },
    });
    if (!session) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Session not found' });
    await this.sessions.revokeFamily(session.familyId, 'revoked_by_user');
  }

  async revokeOtherSessions(
    userId: string,
    currentSessionId: string,
    request: Request,
  ): Promise<void> {
    const current = await this.prisma.client.session.findUnique({
      where: { id: currentSessionId },
      select: { familyId: true },
    });
    await this.sessions.revokeAllForUser(userId, 'signed_out_elsewhere', current?.familyId);
    await this.audit.record({
      action: 'customer.signed_out_other_devices',
      entityType: 'user',
      entityId: userId,
      actorId: userId,
      request,
    });
  }
}
