import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Permission } from '@repo/shared-types';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';
import { TokenService } from '../../src/modules/auth/token.service.js';

/**
 * A staff member with the given permissions and a signed-in, MFA-verified admin session.
 * Shortcut for authorisation tests; the real sign-in flow is covered in auth.e2e-spec.ts.
 */
export async function staffWithSession(
  app: NestExpressApplication,
  email: string,
  permissions: Permission[],
): Promise<{ userId: string; token: string }> {
  const prisma = app.get(PrismaService).client;
  const role = await prisma.adminRole.create({
    data: { key: `role-${randomUUID()}`, name: email },
  });
  for (const key of permissions) {
    const permission = await prisma.permission.upsert({
      where: { key },
      create: { key },
      update: {},
    });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  const user = await prisma.user.create({
    data: {
      email,
      type: 'STAFF',
      // Never checked in these tests; marks the account as having accepted its invite.
      passwordHash: 'test-only-not-a-real-hash',
      emailVerifiedAt: new Date(),
      profile: { create: { firstName: 'Staff', lastName: 'Member' } },
      roles: { create: { roleId: role.id } },
    },
  });
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      audience: 'ADMIN',
      refreshTokenHash: randomUUID(),
      familyId: randomUUID(),
      expiresAt: new Date(Date.now() + 3_600_000),
      mfaVerifiedAt: new Date(),
    },
  });
  const token = await app
    .get(TokenService)
    .signAccess({ userId: user.id, sessionId: session.id, audience: 'admin' });
  return { userId: user.id, token };
}

/** Removes staff created by staffWithSession (and their roles). */
export async function removeStaff(app: NestExpressApplication, emailPrefix: string): Promise<void> {
  const prisma = app.get(PrismaService).client;
  const users = await prisma.user.findMany({
    where: { email: { startsWith: emailPrefix } },
    select: { id: true, roles: { select: { roleId: true } } },
  });
  const roleIds = users.flatMap((u) => u.roles.map((r) => r.roleId));
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  await prisma.adminRole.deleteMany({ where: { id: { in: roleIds } } });
}
