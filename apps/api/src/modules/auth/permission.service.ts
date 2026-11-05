import { Injectable } from '@nestjs/common';
import { PERMISSIONS, type Permission } from '@repo/shared-types';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';

const CACHE_SECONDS = 60;

/** Effective permissions of a staff user (union over roles). The database is authoritative. */
@Injectable()
export class PermissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async forUser(userId: string): Promise<{ roles: string[]; permissions: Permission[] }> {
    const key = this.redis.key('auth', 'perms', userId);
    try {
      const cached = await this.redis.client.get(key);
      if (cached) return JSON.parse(cached) as { roles: string[]; permissions: Permission[] };
    } catch {
      // fall through to the database
    }
    const roles = await this.prisma.client.userRole.findMany({
      where: { userId },
      select: {
        role: {
          select: { key: true, permissions: { select: { permission: { select: { key: true } } } } },
        },
      },
    });
    const known = new Set<string>(PERMISSIONS);
    const permissions = [
      ...new Set(roles.flatMap((r) => r.role.permissions.map((p) => p.permission.key))),
    ].filter((p): p is Permission => known.has(p));
    const result = { roles: roles.map((r) => r.role.key), permissions: permissions.sort() };
    try {
      await this.redis.client.set(key, JSON.stringify(result), 'EX', CACHE_SECONDS);
    } catch {
      // cache is optional
    }
    return result;
  }

  /** Call after changing a user's roles (Phase 8 role management). */
  async invalidate(userId: string): Promise<void> {
    try {
      await this.redis.client.del(this.redis.key('auth', 'perms', userId));
    } catch {
      // expires on its own
    }
  }
}
