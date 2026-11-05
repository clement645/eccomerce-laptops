import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { ApiEnv } from '@repo/configuration';
import { createPrismaClient, describeDatabaseUrl, type PrismaClient } from '@repo/database';
import { API_ENV } from '../../config/env.js';

/**
 * Owns the single Prisma client (and connection pool) for this process.
 * Inject `PrismaService` and use `.client`.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: PrismaClient;
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.client = createPrismaClient({
      connectionString: env.DATABASE_URL,
      maxConnections: env.DATABASE_POOL_MAX,
    });
    this.logger.log(`Database: ${describeDatabaseUrl(env.DATABASE_URL)}`);
  }

  /** Lightweight connectivity check used by the health endpoint. */
  async ping(): Promise<void> {
    await this.client.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
