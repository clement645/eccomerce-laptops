import type { NestExpressApplication } from '@nestjs/platform-express';
import { Queue } from 'bullmq';
import request from 'supertest';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import { LEGACY_MAINTENANCE_QUEUE, LegacyQueueCleanup } from '../src/jobs/legacy-queue.cleanup.js';
import { JobsStatusService } from '../src/jobs/jobs-status.service.js';
import { MaintenanceScheduler } from '../src/jobs/maintenance.scheduler.js';
import { bullConnection } from '../src/jobs/redis-connection.js';
import { createTestApp } from './support/test-app.js';
import { testEnv } from './support/test-env.js';

const run = `jobs${Date.now()}`;

describe('background jobs inside the API (Render Free mode)', () => {
  let app: NestExpressApplication;
  const prefix = `${run}-inline`;

  beforeAll(async () => {
    app = await createTestApp({ BACKGROUND_JOBS: 'inline', REDIS_KEY_PREFIX: prefix });
  });

  afterAll(async () => {
    const redis = app.get(RedisService).client;
    const keys = await redis.keys(`${prefix}:*`);
    if (keys.length) await redis.del(...keys);
    await app.close();
  });

  it('runs the catch-up pass before serving, and reports it on /health', async () => {
    const health = (await request(app.getHttpServer()).get('/api/v1/health').expect(200)).body;
    expect(health.jobs).toMatchObject({
      mode: 'inline',
      catchUp: { finished: true },
      sweeps: { 'payments-and-holds': { ok: true }, 'scheduled-posts': { ok: true } },
    });
    expect(app.get(MaintenanceScheduler)).toBeDefined();
  });

  it('keeps /health/live free of dependency checks', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
  });

  it('removes the old BullMQ maintenance queue and its schedules once', async () => {
    const env = testEnv({ REDIS_KEY_PREFIX: prefix });
    const old = new Queue(LEGACY_MAINTENANCE_QUEUE, {
      connection: bullConnection(env.REDIS_URL),
      prefix: `${prefix}:queue`,
    });
    await old.upsertJobScheduler(
      'release-expired-reservations',
      { every: 60_000 },
      {
        name: 'release-expired-reservations',
      },
    );
    await old.close();
    const redis = app.get(RedisService).client;
    expect((await redis.keys(`${prefix}:queue:maintenance:*`)).length).toBeGreaterThan(0);

    const cleanup = app.get(LegacyQueueCleanup);
    expect(await cleanup.run()).toBe(true);
    expect(await redis.keys(`${prefix}:queue:maintenance:*`)).toEqual([]);
    expect(await cleanup.run()).toBe(false);
  });
});

describe('shutdown (Render sends SIGTERM on deploy and before sleep)', () => {
  it('lets a running sweep finish with its database connection before closing', async () => {
    const app = await createTestApp({ BACKGROUND_JOBS: 'inline' });
    const scheduler = app.get(MaintenanceScheduler);
    const status = app.get(JobsStatusService);
    const before = status.snapshot().sweeps['payments-and-holds']!.lastRunAt;
    await new Promise((r) => setTimeout(r, 5));
    const sweep = scheduler.runOnce(scheduler.sweeps[0]!);
    await app.close();
    await sweep;
    const after = status.snapshot().sweeps['payments-and-holds']!;
    expect(after.lastRunAt).not.toBe(before);
    expect(after.ok).toBe(true);
  });
});

describe('background jobs disabled', () => {
  it('reports that no jobs run in this process', async () => {
    const app = await createTestApp({ BACKGROUND_JOBS: 'external' });
    try {
      const health = (await request(app.getHttpServer()).get('/api/v1/health').expect(200)).body;
      expect(health.jobs).toMatchObject({ mode: 'external', emailConsumer: 'off', catchUp: null });
      expect(() => app.get(MaintenanceScheduler)).toThrow();
    } finally {
      await app.close();
    }
  });
});
