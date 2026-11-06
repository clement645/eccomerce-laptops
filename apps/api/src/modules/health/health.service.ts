import { Injectable } from '@nestjs/common';
import type { DependencyStatus, HealthResponse } from '@repo/shared-types';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { JobsStatusService } from '../../jobs/jobs-status.service.js';

const SERVICE_VERSION = process.env.npm_package_version ?? '0.1.0';
const CHECK_TIMEOUT_MS = 3_000;

async function probe(check: () => Promise<void>): Promise<DependencyStatus> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS);
      }),
    ]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jobs: JobsStatusService,
  ) {}

  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([
      probe(() => this.prisma.ping()),
      probe(() => this.redis.ping()),
    ]);
    // Postgres is authoritative: without it the API cannot serve orders. Redis loss only degrades.
    const status = database === 'down' ? 'down' : redis === 'down' ? 'degraded' : 'ok';
    return {
      status,
      service: 'api',
      version: SERVICE_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: { database, redis },
      jobs: this.jobs.snapshot(),
    };
  }
}
