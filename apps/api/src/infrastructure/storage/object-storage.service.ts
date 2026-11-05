import { Inject, Injectable } from '@nestjs/common';
import { storageConfigured, type ApiEnv } from '@repo/configuration';
import { AwsClient } from 'aws4fetch';
import { API_ENV } from '../../config/env.js';

export class StorageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * S3-compatible object storage: Cloudflare R2 in production, RustFS locally. Only the API talks to
 * it; browsers read public objects through R2_PUBLIC_BASE_URL and never receive credentials.
 */
@Injectable()
export class ObjectStorageService {
  private readonly client: AwsClient | null;
  private readonly endpoint: string;
  readonly publicBucket: string | null;
  readonly privateBucket: string | null;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.publicBucket = env.R2_PUBLIC_BUCKET ?? null;
    this.privateBucket = env.R2_PRIVATE_BUCKET ?? null;
    this.endpoint = (
      env.S3_ENDPOINT_OVERRIDE ?? `https://${env.R2_ACCOUNT_ID ?? 'unset'}.r2.cloudflarestorage.com`
    ).replace(/\/$/, '');
    this.client = storageConfigured(env)
      ? new AwsClient({
          accessKeyId: env.R2_ACCESS_KEY_ID!,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
          service: 's3',
          region: env.S3_ENDPOINT_OVERRIDE ? 'us-east-1' : 'auto',
        })
      : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async put(bucket: string, key: string, body: Uint8Array, contentType: string): Promise<void> {
    const res = await this.send(this.url(bucket, key), {
      method: 'PUT',
      // A plain copy: fetch needs an ArrayBuffer-backed view, not a pooled Buffer.
      body: new Uint8Array(body),
      headers: {
        'Content-Type': contentType,
        // Keys are unique per upload, so objects never change and can be cached forever.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
    if (!res.ok) throw new StorageError(`Upload failed (HTTP ${res.status})`, res.status);
  }

  async delete(bucket: string, key: string): Promise<void> {
    const res = await this.send(this.url(bucket, key), { method: 'DELETE' });
    if (!res.ok && res.status !== 404)
      throw new StorageError(`Delete failed (HTTP ${res.status})`, res.status);
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    const res = await this.send(this.url(bucket, key), { method: 'HEAD' });
    return res.ok;
  }

  /** Creates a bucket if it is missing. Local development only (R2 buckets are created in Cloudflare). */
  async ensureBucket(bucket: string, publicRead: boolean): Promise<'created' | 'exists'> {
    const head = await this.send(`${this.endpoint}/${bucket}`, { method: 'HEAD' });
    let outcome: 'created' | 'exists' = 'exists';
    if (!head.ok) {
      const res = await this.send(`${this.endpoint}/${bucket}`, { method: 'PUT' });
      if (!res.ok)
        throw new StorageError(
          `Could not create bucket ${bucket} (HTTP ${res.status})`,
          res.status,
        );
      outcome = 'created';
    }
    if (publicRead) {
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucket}/*`],
          },
        ],
      };
      const res = await this.send(`${this.endpoint}/${bucket}?policy`, {
        method: 'PUT',
        body: JSON.stringify(policy),
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok)
        throw new StorageError(
          `Could not make ${bucket} publicly readable (HTTP ${res.status})`,
          res.status,
        );
    }
    return outcome;
  }

  private url(bucket: string, key: string): string {
    return `${this.endpoint}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    if (!this.client) throw new StorageError('Object storage is not configured', 503);
    try {
      return await this.client.fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      throw new StorageError(`Object storage unreachable: ${(error as Error).message}`, 503);
    }
  }
}
