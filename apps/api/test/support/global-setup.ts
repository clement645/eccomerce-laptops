import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Redis } from 'ioredis';
import { ObjectStorageService } from '../../src/infrastructure/storage/object-storage.service.js';
import { TEST_DATABASE_URL, TEST_REDIS_URL, testEnv } from './test-env.js';

const databasePackage = fileURLToPath(new URL('../../../../packages/database', import.meta.url));

/** Apply migrations to the test database and start from an empty Redis test DB. */
export default async function globalSetup(): Promise<void> {
  try {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: databasePackage,
      env: { ...process.env, DB_TARGET: 'test', TEST_DATABASE_URL },
      stdio: 'pipe',
    });
  } catch (error) {
    const output = (error as { stderr?: Buffer; stdout?: Buffer }).stderr?.toString() ?? '';
    throw new Error(
      `Could not migrate the test database. Is Docker running? Try "pnpm docker:up".\n${output}`,
    );
  }

  const redis = new Redis(TEST_REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    await redis.flushdb();
  } catch (error) {
    throw new Error(
      `Could not reach the test Redis (${(error as Error).message}). Try "pnpm docker:up".`,
    );
  } finally {
    redis.disconnect();
  }

  // Uploads in tests go to a public bucket of their own in the local RustFS container.
  const storage = new ObjectStorageService(testEnv());
  try {
    await storage.ensureBucket(storage.publicBucket!, true);
  } catch (error) {
    throw new Error(
      `Could not prepare test storage (${(error as Error).message}). Try "pnpm docker:up".`,
    );
  }
}
