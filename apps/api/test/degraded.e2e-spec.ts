import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './support/test-app.js';

/** Redis is not authoritative: with Redis unreachable the API must keep serving from Postgres. */
describe('Redis outage (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    // Nothing listens on port 1, so Redis is unavailable for this app instance.
    app = await createTestApp({ REDIS_URL: 'redis://127.0.0.1:1' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports degraded health, not down', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body).toMatchObject({
      status: 'degraded',
      checks: { database: 'up', redis: 'down' },
    });
  });

  it('still serves data (cache and rate limit fail open)', async () => {
    await request(app.getHttpServer()).get('/api/v1/settings/public').expect(200);
  });
});
