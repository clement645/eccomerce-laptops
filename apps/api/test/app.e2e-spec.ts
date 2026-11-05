import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './support/test-app.js';

describe('HTTP foundation (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health reports database and Redis up', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      service: 'api',
      checks: { database: 'up', redis: 'up' },
    });
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('GET /api/v1/health/live does not depend on anything', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(200, { status: 'ok' });
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows configured origins and rejects others', async () => {
    const allowed = await request(app.getHttpServer())
      .options('/api/v1/settings/public')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await request(app.getHttpServer())
      .options('/api/v1/settings/public')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns the standard error envelope for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('rejects oversized JSON bodies', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(200_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('serves the OpenAPI document outside production', async () => {
    const res = await request(app.getHttpServer()).get('/docs/openapi.json').expect(200);
    expect(res.body.paths).toHaveProperty('/api/v1/health');
    expect(res.body.paths).toHaveProperty('/api/v1/settings/public');
  });
});
