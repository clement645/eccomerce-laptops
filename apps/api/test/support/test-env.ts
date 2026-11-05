import type { ApiEnv } from '@repo/configuration';
import { loadApiEnv } from '../../src/config/env.js';

/** Integration tests use the Docker services (`pnpm docker:up`), never Neon. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://ecommerce:ecommerce@localhost:5442/ecommerce_test';
/** Logical database 15 keeps test keys away from development data. */
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';

export function testEnv(overrides: Record<string, string> = {}): ApiEnv {
  return loadApiEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    API_PUBLIC_URL: 'http://localhost:4000',
    CORS_ORIGINS: 'http://localhost:3000,http://localhost:5173',
    DATABASE_URL: TEST_DATABASE_URL,
    DATABASE_POOL_MAX: '3',
    REDIS_URL: TEST_REDIS_URL,
    REDIS_KEY_PREFIX: 'ecommerce-test',
    JWT_ACCESS_SECRET: 'test-access-secret-'.padEnd(48, 'x'),
    MFA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    STOREFRONT_URL: 'http://localhost:3000',
    ADMIN_URL: 'http://localhost:5173',
    MAIL_TRANSPORT: 'memory',
    MAIL_DELIVERY: 'direct',
    PAYMENTS_SIMULATED: 'true',
    // Uploads go to the local RustFS container, in a bucket only tests use.
    S3_ENDPOINT_OVERRIDE: 'http://localhost:9000',
    R2_ACCESS_KEY_ID: 'devaccesskey',
    R2_SECRET_ACCESS_KEY: 'devsecretkey',
    R2_PUBLIC_BUCKET: 'media-test',
    R2_PUBLIC_BASE_URL: 'http://localhost:9000/media-test',
    ...overrides,
  });
}
