import { Logger } from '@nestjs/common';
import type { RedisService } from '../redis/redis.service.js';
import { CacheNamespace, CacheService } from './cache.service.js';

function fakeRedis(options: { broken?: boolean } = {}) {
  const store = new Map<string, string>();
  const fail = () => Promise.reject(new Error('Connection is closed.'));
  const client = {
    get: (key: string) => (options.broken ? fail() : Promise.resolve(store.get(key) ?? null)),
    set: (key: string, value: string) =>
      options.broken ? fail() : Promise.resolve(store.set(key, value) && 'OK'),
    del: (key: string) => (options.broken ? fail() : Promise.resolve(Number(store.delete(key)))),
    incr: (key: string) => {
      if (options.broken) return fail();
      const next = Number(store.get(key) ?? '0') + 1;
      store.set(key, String(next));
      return Promise.resolve(next);
    },
  };
  const redis = { client, key: (...parts: (string | number)[]) => ['test', ...parts].join(':') };
  return { redis: redis as unknown as RedisService, store };
}

describe('CacheService', () => {
  beforeAll(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('loads once, then serves from cache', async () => {
    const { redis, store } = fakeRedis();
    const cache = new CacheService(redis);
    const loader = vi.fn().mockResolvedValue({ name: 'Laptops' });

    expect(await cache.getOrSet(CacheNamespace.category, 'tree', loader)).toEqual({
      name: 'Laptops',
    });
    expect(await cache.getOrSet(CacheNamespace.category, 'tree', loader)).toEqual({
      name: 'Laptops',
    });
    expect(loader).toHaveBeenCalledTimes(1);
    expect([...store.keys()]).toContain('test:category:v0:tree');
  });

  it('invalidates a whole namespace by bumping its version', async () => {
    const { redis } = fakeRedis();
    const cache = new CacheService(redis);
    const loader = vi.fn().mockResolvedValueOnce('old').mockResolvedValueOnce('new');

    await cache.getOrSet(CacheNamespace.product, 'abc', loader);
    await cache.invalidateNamespace(CacheNamespace.product);
    expect(await cache.getOrSet(CacheNamespace.product, 'abc', loader)).toBe('new');
  });

  it('fails open when Redis is unavailable', async () => {
    const { redis } = fakeRedis({ broken: true });
    const cache = new CacheService(redis);
    const loader = vi.fn().mockResolvedValue(42);

    expect(await cache.getOrSet(CacheNamespace.homepage, 'x', loader)).toBe(42);
    await expect(cache.invalidateNamespace(CacheNamespace.homepage)).resolves.toBeUndefined();
  });
});
