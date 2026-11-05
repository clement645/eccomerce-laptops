import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import { createTestApp } from './support/test-app.js';

describe('Rate limiting (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ RATE_LIMIT_PER_MINUTE: '3' });
    const redis = app.get(RedisService);
    const keys = await redis.client.keys('ecommerce-test:ratelimit:*');
    if (keys.length) await redis.client.del(...keys);
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows requests within the budget and reports remaining quota', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/settings/public').expect(200);
    expect(res.headers['ratelimit-limit']).toBe('3');
    expect(res.headers['ratelimit-remaining']).toBe('2');
  });

  it('returns 429 with Retry-After once the budget is spent', async () => {
    await request(app.getHttpServer()).get('/api/v1/settings/public').expect(200);
    await request(app.getHttpServer()).get('/api/v1/settings/public').expect(200);
    const res = await request(app.getHttpServer()).get('/api/v1/settings/public').expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('never rate-limits health checks', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    }
  });
});
