/**
 * Create (or promote) a staff account with a role, for bootstrapping the first administrator.
 *
 *   pnpm --filter @repo/api admin:create --email admin@example.co.ke --name "Jane Wanjiku" [--role SUPER_ADMIN]
 *
 * The password comes from ADMIN_PASSWORD, or a strong one is generated and printed once.
 * Two-factor authentication is enrolled at first sign-in.
 */
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { createPrismaClient } from '@repo/database';
import { AdminRole } from '@repo/shared-types';
import { emailSchema, passwordSchema } from '@repo/validation';
import { hashPassword } from '../modules/auth/crypto/password.js';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string', default: 'SUPER_ADMIN' },
    },
  });
  const email = emailSchema.parse(values.email ?? '');
  const [firstName = 'Admin', ...rest] = (values.name ?? 'Store Admin').trim().split(/\s+/);
  const roleKey = values.role ?? 'SUPER_ADMIN';
  if (!(roleKey in AdminRole))
    throw new Error(`Unknown role ${roleKey}. Use one of: ${Object.keys(AdminRole).join(', ')}`);

  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD ?? randomBytes(18).toString('base64url');
  passwordSchema.parse(password);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const prisma = createPrismaClient({ connectionString: url, maxConnections: 1 });
  try {
    const role = await prisma.adminRole.findUnique({ where: { key: roleKey } });
    if (!role) throw new Error(`Role ${roleKey} not found. Run the database seed first.`);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.type !== 'STAFF') {
      throw new Error('That email belongs to a customer account. Use a separate email for staff.');
    }
    const user = existing
      ? existing
      : await prisma.user.create({
          data: {
            email,
            type: 'STAFF',
            passwordHash: await hashPassword(password),
            emailVerifiedAt: new Date(),
            profile: { create: { firstName, lastName: rest.join(' ') || 'Admin' } },
          },
        });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });
    await prisma.auditLog.create({
      data: {
        action: 'admin.role_granted_cli',
        entityType: 'user',
        entityId: user.id,
        after: { role: roleKey },
      },
    });

    console.warn(
      existing
        ? `Granted ${roleKey} to existing staff user ${email}.`
        : `Created ${roleKey} ${email}.`,
    );
    if (!existing && generated) {
      console.warn(`Temporary password (shown once, store it in a password manager): ${password}`);
    }
    console.warn('Sign in to the admin dashboard to set up two-factor authentication.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
