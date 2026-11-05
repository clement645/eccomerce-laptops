/**
 * Creates the local media buckets in RustFS and makes the public one readable by browsers.
 *
 *   pnpm --filter @repo/api storage:init
 *
 * Local development only. In production, create the R2 buckets and the public custom domain in
 * the Cloudflare dashboard (see docs/ENVIRONMENT.md).
 */
import { loadApiEnv } from '../config/env.js';
import { ObjectStorageService } from '../infrastructure/storage/object-storage.service.js';

async function main(): Promise<void> {
  const env = loadApiEnv(process.env);
  if (!env.S3_ENDPOINT_OVERRIDE)
    throw new Error('storage:init is for local S3-compatible storage (set S3_ENDPOINT_OVERRIDE).');
  const storage = new ObjectStorageService(env);
  if (!storage.enabled || !storage.publicBucket)
    throw new Error('Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_PUBLIC_BUCKET first.');
  console.warn(
    `${storage.publicBucket}: ${await storage.ensureBucket(storage.publicBucket, true)} (public read)`,
  );
  if (storage.privateBucket)
    console.warn(
      `${storage.privateBucket}: ${await storage.ensureBucket(storage.privateBucket, false)} (private)`,
    );
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
