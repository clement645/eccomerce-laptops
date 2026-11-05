import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@repo/database';
import type { Request } from 'express';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

export interface AuditEvent {
  action: string;
  entityType: string;
  entityId?: string | null;
  actorId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  request?: Request;
}

/**
 * Append-only audit trail for security-relevant and administrative actions.
 * Never record secrets (passwords, tokens, TOTP seeds) in before/after.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditEvent): Promise<void> {
    try {
      await this.prisma.client.auditLog.create({
        data: {
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId ?? null,
          actorId: event.actorId ?? null,
          before: event.before,
          after: event.after,
          ip: event.request?.ip ?? null,
          userAgent: event.request?.headers['user-agent']?.slice(0, 300) ?? null,
          requestId:
            typeof (event.request as { id?: unknown } | undefined)?.id === 'string'
              ? (event.request as unknown as { id: string }).id
              : null,
        },
      });
    } catch (error) {
      // Auditing must not break the request, but a failure is itself worth an alert.
      this.logger.error(`Audit write failed for ${event.action}: ${(error as Error).message}`);
    }
  }
}
