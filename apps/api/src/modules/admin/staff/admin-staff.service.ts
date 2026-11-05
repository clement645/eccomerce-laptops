import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import { Prisma } from '@repo/database';
import type { AdminRoleDetail, AdminStaffMember, Permission } from '@repo/shared-types';
import type {
  RoleInput,
  SetStaffPasswordInput,
  StaffInviteInput,
  StaffUpdateInput,
} from '@repo/validation';
import { API_ENV } from '../../../config/env.js';
import { MailService } from '../../../infrastructure/mail/mail.service.js';
import { emails } from '../../../infrastructure/mail/templates.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { hashPassword } from '../../auth/crypto/password.js';
import { hashToken, randomToken } from '../../auth/crypto/tokens.js';
import { PermissionService } from '../../auth/permission.service.js';
import { SessionService } from '../../auth/session.service.js';
import { mapWriteError, notFound } from '../admin-errors.js';

type Tx = Prisma.TransactionClient;
const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

const staffInclude = {
  profile: true,
  roles: { include: { role: { select: { id: true, key: true, name: true } } } },
} satisfies Prisma.UserInclude;
type StaffRow = Prisma.UserGetPayload<{ include: typeof staffInclude }>;

const invalidLink = () =>
  new BadRequestException({
    code: 'INVALID_TOKEN',
    message: 'This link is invalid or has expired',
  });

/**
 * Staff accounts and roles. Guard rails: system roles are read-only, nobody changes their own
 * access, and the last account able to manage staff cannot be removed or locked out.
 */
@Injectable()
export class AdminStaffService {
  private readonly adminUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly sessions: SessionService,
    private readonly mail: MailService,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.adminUrl = env.ADMIN_URL.replace(/\/$/, '');
  }

  // ── Roles ──────────────────────────────────────────────────────────────────

  async roles(): Promise<AdminRoleDetail[]> {
    const rows = await this.prisma.client.adminRole.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: {
        permissions: { select: { permission: { select: { key: true } } } },
        _count: { select: { users: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.permissions.map((p) => p.permission.key as Permission).sort(),
      staffCount: r._count.users,
    }));
  }

  async saveRole(id: string | null, input: RoleInput): Promise<AdminRoleDetail> {
    const roleId = await this.prisma.client
      .$transaction(async (tx) => {
        let role;
        if (id) {
          const existing = await tx.adminRole.findUnique({ where: { id } });
          if (!existing) throw notFound('Role');
          if (existing.isSystem)
            throw new ConflictException({
              code: 'SYSTEM_ROLE',
              message: 'Built-in roles cannot be changed. Create a custom role instead.',
            });
          role = await tx.adminRole.update({
            where: { id },
            data: { name: input.name, description: input.description },
          });
          await tx.rolePermission.deleteMany({ where: { roleId: id } });
        } else {
          const key = `CUSTOM_${input.name
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_')
            .replace(/^_|_$/g, '')}`;
          role = await tx.adminRole.create({
            data: { key, name: input.name, description: input.description, isSystem: false },
          });
        }
        for (const key of input.permissions) {
          const permission = await tx.permission.upsert({
            where: { key },
            create: { key },
            update: {},
          });
          await tx.rolePermission.create({
            data: { roleId: role.id, permissionId: permission.id },
          });
        }
        await this.assertSomeoneCanManageStaff(tx);
        return role.id;
      })
      .catch((error: unknown) => mapWriteError(error, { key: 'role name', name: 'role name' }));
    await this.invalidateRole(roleId);
    return (await this.roles()).find((r) => r.id === roleId)!;
  }

  async deleteRole(id: string): Promise<void> {
    const role = await this.prisma.client.adminRole.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw notFound('Role');
    if (role.isSystem)
      throw new ConflictException({
        code: 'SYSTEM_ROLE',
        message: 'Built-in roles cannot be deleted',
      });
    if (role._count.users > 0)
      throw new ConflictException({ code: 'IN_USE', message: 'Remove this role from staff first' });
    await this.prisma.client.adminRole.delete({ where: { id } });
  }

  // ── Staff ──────────────────────────────────────────────────────────────────

  async staff(): Promise<AdminStaffMember[]> {
    const rows = await this.prisma.client.user.findMany({
      where: { type: 'STAFF', status: { not: 'DELETED' } },
      orderBy: { createdAt: 'asc' },
      include: staffInclude,
    });
    return rows.map(toStaff);
  }

  /** Creates the account without a password and emails a one-time link to set one. */
  async invite(input: StaffInviteInput, actorId: string): Promise<AdminStaffMember> {
    await this.assertRolesExist(input.roleIds);
    const existing = await this.prisma.client.user.findUnique({ where: { email: input.email } });
    if (existing)
      throw new ConflictException({
        code: 'ALREADY_EXISTS',
        message: 'An account with that email already exists',
        details: [{ path: 'email', message: 'An account with that email already exists' }],
      });
    const user = await this.prisma.client.user.create({
      data: {
        email: input.email,
        type: 'STAFF',
        profile: { create: { firstName: input.firstName, lastName: input.lastName } },
        roles: { create: input.roleIds.map((roleId) => ({ roleId, grantedById: actorId })) },
      },
      include: staffInclude,
    });
    await this.sendInvite(user.id, user.email, input.firstName);
    return toStaff(user);
  }

  async resendInvite(id: string): Promise<void> {
    const user = await this.prisma.client.user.findFirst({
      where: { id, type: 'STAFF', status: 'ACTIVE' },
      include: { profile: true },
    });
    if (!user) throw notFound('Staff member');
    if (user.passwordHash)
      throw new ConflictException({
        code: 'ALREADY_ACCEPTED',
        message: 'This person has already set a password',
      });
    await this.sendInvite(user.id, user.email, user.profile?.firstName ?? 'there');
  }

  async update(id: string, input: StaffUpdateInput, actorId: string): Promise<AdminStaffMember> {
    if (id === actorId)
      throw new ConflictException({
        code: 'SELF_CHANGE',
        message: 'Ask another administrator to change your own access',
      });
    if (input.roleIds) await this.assertRolesExist(input.roleIds);
    await this.prisma.client.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id, type: 'STAFF', status: { not: 'DELETED' } },
      });
      if (!user) throw notFound('Staff member');
      if (input.status) await tx.user.update({ where: { id }, data: { status: input.status } });
      if (input.roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({
          data: input.roleIds.map((roleId) => ({ userId: id, roleId, grantedById: actorId })),
        });
      }
      await this.assertSomeoneCanManageStaff(tx);
    });
    await this.permissions.invalidate(id);
    if (input.status === 'SUSPENDED') await this.sessions.revokeAllForUser(id, 'suspended');
    return toStaff(
      await this.prisma.client.user.findUniqueOrThrow({ where: { id }, include: staffInclude }),
    );
  }

  /** For a lost phone: the person enrols a new authenticator at next sign-in. */
  async resetMfa(id: string, actorId: string): Promise<void> {
    if (id === actorId)
      throw new ConflictException({
        code: 'SELF_CHANGE',
        message: 'Ask another administrator to reset your two-factor',
      });
    const updated = await this.prisma.client.user.updateMany({
      where: { id, type: 'STAFF' },
      data: { mfaSecretEncrypted: null, mfaEnabledAt: null },
    });
    if (updated.count !== 1) throw notFound('Staff member');
    await this.sessions.revokeAllForUser(id, 'mfa_reset');
  }

  /** Public: the invite (or reset) link. Single use; signs out any existing sessions. */
  async setPassword(input: SetStaffPasswordInput): Promise<void> {
    const record = await this.prisma.client.verificationToken.findUnique({
      where: { tokenHash: hashToken(input.token) },
      include: { user: { select: { type: true, status: true } } },
    });
    if (
      !record ||
      record.purpose !== 'PASSWORD_RESET' ||
      record.usedAt ||
      record.expiresAt.getTime() <= Date.now() ||
      record.user.type !== 'STAFF' ||
      record.user.status !== 'ACTIVE'
    )
      throw invalidLink();
    const claimed = await this.prisma.client.verificationToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw invalidLink();
    await this.prisma.client.user.update({
      where: { id: record.userId },
      data: {
        passwordHash: await hashPassword(input.password),
        emailVerifiedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    await this.sessions.revokeAllForUser(record.userId, 'password_set');
  }

  private async sendInvite(userId: string, email: string, firstName: string): Promise<void> {
    const token = randomToken();
    await this.prisma.client.$transaction([
      this.prisma.client.verificationToken.updateMany({
        where: { userId, purpose: 'PASSWORD_RESET', usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.client.verificationToken.create({
        data: {
          userId,
          purpose: 'PASSWORD_RESET',
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        },
      }),
    ]);
    await this.mail.send(
      emails.staffInvite(email, firstName, `${this.adminUrl}/set-password?token=${token}`),
    );
  }

  private async assertRolesExist(roleIds: string[]): Promise<void> {
    const found = await this.prisma.client.adminRole.count({ where: { id: { in: roleIds } } });
    if (found !== new Set(roleIds).size)
      throw new UnprocessableEntityException({
        code: 'INVALID_REFERENCE',
        message: 'One of the roles does not exist',
      });
  }

  /** Inside the change's transaction: refuse anything that leaves nobody able to manage staff. */
  private async assertSomeoneCanManageStaff(tx: Tx): Promise<void> {
    const count = await tx.user.count({
      where: {
        type: 'STAFF',
        status: 'ACTIVE',
        passwordHash: { not: null },
        roles: {
          some: { role: { permissions: { some: { permission: { key: 'staff:manage' } } } } },
        },
      },
    });
    if (count === 0)
      throw new ConflictException({
        code: 'LAST_ADMIN',
        message: 'At least one active staff member must be able to manage staff',
      });
  }

  private async invalidateRole(roleId: string): Promise<void> {
    const users = await this.prisma.client.userRole.findMany({
      where: { roleId },
      select: { userId: true },
    });
    await Promise.all(users.map((u) => this.permissions.invalidate(u.userId)));
  }
}

function toStaff(u: StaffRow): AdminStaffMember {
  return {
    id: u.id,
    email: u.email,
    name: u.profile ? `${u.profile.firstName} ${u.profile.lastName}` : u.email,
    status: u.status,
    roles: u.roles.map((r) => r.role),
    mfaEnabled: u.mfaEnabledAt !== null,
    invitePending: u.passwordHash === null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}
