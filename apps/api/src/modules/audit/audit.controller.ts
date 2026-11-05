import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuditLogEntry, Paginated } from '@repo/shared-types';
import { paginationSchema, type PaginationInput } from '@repo/validation';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { AdminAuth } from '../auth/guards/auth.decorators.js';

@ApiTags('admin-audit')
@Controller('admin/audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  /** Newest first. Requires audit:read (Super Administrator by default). */
  @Get()
  @AdminAuth('audit:read')
  async list(
    @Query(new ZodValidationPipe(paginationSchema)) query: PaginationInput,
  ): Promise<Paginated<AuditLogEntry>> {
    const [total, rows] = await Promise.all([
      this.prisma.client.auditLog.count(),
      this.prisma.client.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { actor: { select: { id: true, email: true } } },
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        actor: r.actor,
        ip: r.ip,
        createdAt: r.createdAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }
}
