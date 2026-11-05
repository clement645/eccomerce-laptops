import type { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { RedisService } from '../../infrastructure/redis/redis.service.js';
import { HealthService } from './health.service.js';

const up = () => Promise.resolve();
const down = () => Promise.reject(new Error('down'));

function service(db: () => Promise<void>, redis: () => Promise<void>) {
  return new HealthService(
    { ping: db } as unknown as PrismaService,
    { ping: redis } as unknown as RedisService,
  );
}

describe('HealthService', () => {
  it('is ok when every dependency is up', async () => {
    const result = await service(up, up).check();
    expect(result).toMatchObject({ status: 'ok', checks: { database: 'up', redis: 'up' } });
  });

  it('is degraded (not down) when only Redis is unavailable', async () => {
    expect((await service(up, down).check()).status).toBe('degraded');
  });

  it('is down when the database is unavailable', async () => {
    const result = await service(down, up).check();
    expect(result).toMatchObject({ status: 'down', checks: { database: 'down' } });
  });
});
