import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import { createTestApp } from './support/test-app.js';

describe('GET /api/v1/settings/public (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  const announcement = { enabled: true, messages: ['Genuine Electronics'], href: null };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await prisma.client.storeSetting.deleteMany({});
    await prisma.client.storeSetting.createMany({
      data: [
        { key: 'announcement.bar', value: announcement },
        { key: 'checkout.cashOnDelivery', value: { enabled: true, maxOrderMinor: 100 } },
      ],
    });
    await app.get(SettingsService).invalidate();
  });

  afterAll(async () => {
    await prisma.client.storeSetting.deleteMany({});
    await app.close();
  });

  it('returns public settings from the database', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/settings/public').expect(200);
    expect(res.body.announcement).toEqual(announcement);
    expect(res.body.trustIndicators).toEqual([]);
    expect(res.headers['cache-control']).toContain('max-age=60');
  });

  it('never exposes private settings', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/settings/public');
    expect(JSON.stringify(res.body)).not.toContain('maxOrderMinor');
  });

  it('serves from the Redis cache until invalidated', async () => {
    const redis = app.get(RedisService);
    const keys = await redis.client.keys('ecommerce-test:settings:*');
    expect(keys.length).toBeGreaterThan(0);

    await prisma.client.storeSetting.update({
      where: { key: 'announcement.bar' },
      data: { value: { ...announcement, messages: ['Updated'] } },
    });
    const cached = await request(app.getHttpServer()).get('/api/v1/settings/public');
    expect(cached.body.announcement.messages).toEqual(['Genuine Electronics']);

    await app.get(SettingsService).invalidate();
    const fresh = await request(app.getHttpServer()).get('/api/v1/settings/public');
    expect(fresh.body.announcement.messages).toEqual(['Updated']);
  });
});
