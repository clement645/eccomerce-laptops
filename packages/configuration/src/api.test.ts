import { describe, expect, it } from 'vitest';
import { apiEnvSchema, mpesaMode, storageConfigured } from './api.js';
import { EnvValidationError, parseEnv } from './parse.js';

/** n bytes of `fill`, base64-encoded (portable: no Node Buffer in this package). */
const base64Key = (n: number, fill: number) =>
  btoa(String.fromCharCode(...new Array<number>(n).fill(fill)));

const valid = {
  NODE_ENV: 'development',
  API_PUBLIC_URL: 'http://localhost:4000',
  CORS_ORIGINS: 'http://localhost:3000, http://localhost:5173/',
  DATABASE_URL: 'postgresql://user:pass@localhost:5442/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'j'.repeat(40),
  MFA_ENCRYPTION_KEY: base64Key(32, 7),
  STOREFRONT_URL: 'http://localhost:3000',
  ADMIN_URL: 'http://localhost:5173',
};

const production = {
  NODE_ENV: 'production',
  API_PUBLIC_URL: 'https://api.example.co.ke',
  CORS_ORIGINS: 'https://www.example.co.ke,https://admin.example.co.ke',
  DATABASE_URL: 'postgresql://user:pass@ep-x-pooler.aws.neon.tech/db?sslmode=require',
  REDIS_URL: 'rediss://default:secret@redis.example.com:6380',
  JWT_ACCESS_SECRET: 'j'.repeat(40),
  MFA_ENCRYPTION_KEY: base64Key(32, 7),
  STOREFRONT_URL: 'https://www.example.co.ke',
  ADMIN_URL: 'https://admin.example.co.ke',
};

describe('apiEnvSchema', () => {
  it('keeps same-site cookies unless cross-site cookies are turned on', () => {
    expect(parseEnv('api', apiEnvSchema, valid).CROSS_SITE_COOKIES).toBe(false);
    expect(
      parseEnv('api', apiEnvSchema, { ...production, CROSS_SITE_COOKIES: 'true' })
        .CROSS_SITE_COOKIES,
    ).toBe(true);
    expect(() => parseEnv('api', apiEnvSchema, { ...valid, CROSS_SITE_COOKIES: 'yes' })).toThrow(
      EnvValidationError,
    );
  });

  it('parses and normalises a valid environment', () => {
    const env = parseEnv('api', apiEnvSchema, valid);
    expect(env.PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000', 'http://localhost:5173']);
    expect(env.REDIS_KEY_PREFIX).toBe('ecommerce');
    expect(env.DATABASE_POOL_MAX).toBe(10);
  });

  it('accepts a correct production environment', () => {
    expect(() => parseEnv('api', apiEnvSchema, production)).not.toThrow();
  });

  it('rejects origins with paths', () => {
    expect(() =>
      parseEnv('api', apiEnvSchema, { ...valid, CORS_ORIGINS: 'http://localhost:3000/app' }),
    ).toThrow(EnvValidationError);
  });

  it('requires a database and Redis URL of the right kind', () => {
    expect(() => parseEnv('api', apiEnvSchema, { ...valid, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL/,
    );
    expect(() =>
      parseEnv('api', apiEnvSchema, { ...valid, DATABASE_URL: 'mysql://x@y/z' }),
    ).toThrow(/DATABASE_URL/);
    expect(() => parseEnv('api', apiEnvSchema, { ...valid, REDIS_URL: 'http://x' })).toThrow(
      /REDIS_URL/,
    );
  });

  it('enforces https and TLS for every connection in production', () => {
    expect(() =>
      parseEnv('api', apiEnvSchema, { ...production, API_PUBLIC_URL: 'http://api.example.co.ke' }),
    ).toThrow(/API_PUBLIC_URL/);
    expect(() =>
      parseEnv('api', apiEnvSchema, {
        ...production,
        DATABASE_URL: 'postgresql://user:pass@host/db',
      }),
    ).toThrow(/sslmode/);
    expect(() =>
      parseEnv('api', apiEnvSchema, { ...production, REDIS_URL: 'redis://redis.example.com:6379' }),
    ).toThrow(/rediss/);
  });

  it('does not echo values in error messages', () => {
    try {
      parseEnv('api', apiEnvSchema, { ...valid, DATABASE_URL: 'super-secret-value' });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain('super-secret-value');
    }
  });
});

describe('revalidation settings', () => {
  it('requires the revalidation URL and secret together', () => {
    expect(() =>
      parseEnv('api', apiEnvSchema, {
        ...valid,
        STOREFRONT_REVALIDATE_URL: 'http://localhost:3000/api/revalidate',
      }),
    ).toThrow(/REVALIDATE_SECRET/);
    expect(() =>
      parseEnv('api', apiEnvSchema, {
        ...valid,
        STOREFRONT_REVALIDATE_URL: 'http://localhost:3000/api/revalidate',
        REVALIDATE_SECRET: 'x'.repeat(32),
      }),
    ).not.toThrow();
  });

  it('rejects short secrets', () => {
    expect(() =>
      parseEnv('api', apiEnvSchema, {
        ...valid,
        STOREFRONT_REVALIDATE_URL: 'http://localhost:3000/api/revalidate',
        REVALIDATE_SECRET: 'short',
      }),
    ).toThrow(/32/);
  });
});

describe('authentication settings', () => {
  it('requires a strong JWT secret and a 32-byte MFA key', () => {
    expect(() => parseEnv('api', apiEnvSchema, { ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
    expect(() =>
      parseEnv('api', apiEnvSchema, {
        ...valid,
        MFA_ENCRYPTION_KEY: base64Key(16, 0),
      }),
    ).toThrow(/MFA_ENCRYPTION_KEY/);
  });

  it('refuses the in-memory mail transport in production', () => {
    expect(() =>
      parseEnv('api', apiEnvSchema, { ...production, MAIL_TRANSPORT: 'memory' }),
    ).toThrow(/MAIL_TRANSPORT/);
  });
});

describe('payment settings', () => {
  it('refuses simulated payments in production', () => {
    expect(() =>
      parseEnv('api', apiEnvSchema, { ...production, PAYMENTS_SIMULATED: 'true' }),
    ).toThrow(/PAYMENTS_SIMULATED/);
    expect(
      parseEnv('api', apiEnvSchema, { ...valid, PAYMENTS_SIMULATED: 'true' }).PAYMENTS_SIMULATED,
    ).toBe(true);
  });

  const daraja = {
    MPESA_CONSUMER_KEY: 'key',
    MPESA_CONSUMER_SECRET: 'secret',
    MPESA_SHORTCODE: '174379',
    MPESA_PASSKEY: 'passkey',
    MPESA_CALLBACK_SECRET: 'c'.repeat(32),
  };

  it('requires all M-Pesa credentials together', () => {
    expect(() => parseEnv('api', apiEnvSchema, { ...valid, MPESA_CONSUMER_KEY: 'key' })).toThrow(
      /MPESA_PASSKEY/,
    );
    expect(mpesaMode(parseEnv('api', apiEnvSchema, valid))).toBe('disabled');
  });

  it('needs an https callback for Daraja', () => {
    expect(() => parseEnv('api', apiEnvSchema, { ...valid, ...daraja })).toThrow(
      /MPESA_CALLBACK_BASE_URL/,
    );
    const env = parseEnv('api', apiEnvSchema, {
      ...valid,
      ...daraja,
      MPESA_CALLBACK_BASE_URL: 'https://tunnel.example.com',
      MPESA_ALLOWED_IPS: '196.201.214.200, 196.201.214.206',
    });
    expect(mpesaMode(env)).toBe('daraja');
    expect(env.MPESA_ENV).toBe('sandbox');
    expect(env.MPESA_ALLOWED_IPS).toEqual(['196.201.214.200', '196.201.214.206']);
  });

  it('refuses live M-Pesa without explicit approval', () => {
    const live = { ...production, ...daraja, MPESA_ENV: 'production' };
    expect(() => parseEnv('api', apiEnvSchema, live)).toThrow(/PAYMENTS_LIVE_APPROVED/);
    expect(
      mpesaMode(parseEnv('api', apiEnvSchema, { ...live, PAYMENTS_LIVE_APPROVED: 'true' })),
    ).toBe('daraja');
  });
});

describe('object storage settings', () => {
  const storage = {
    R2_ACCESS_KEY_ID: 'id',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_PUBLIC_BUCKET: 'media-public',
    R2_PUBLIC_BASE_URL: 'http://localhost:9000/media-public',
  };

  it('needs credentials, a bucket and an endpoint together', () => {
    expect(storageConfigured(parseEnv('api', apiEnvSchema, valid))).toBe(false);
    expect(() => parseEnv('api', apiEnvSchema, { ...valid, R2_ACCESS_KEY_ID: 'id' })).toThrow(
      /R2_ACCESS_KEY_ID/,
    );
    expect(() => parseEnv('api', apiEnvSchema, { ...valid, ...storage })).toThrow(/R2_ACCOUNT_ID/);
    const env = parseEnv('api', apiEnvSchema, {
      ...valid,
      ...storage,
      S3_ENDPOINT_OVERRIDE: 'http://localhost:9000',
    });
    expect(storageConfigured(env)).toBe(true);
  });

  it('refuses a custom endpoint in production', () => {
    expect(() =>
      parseEnv('api', apiEnvSchema, {
        ...production,
        ...storage,
        R2_PUBLIC_BASE_URL: 'https://media.example.co.ke',
        S3_ENDPOINT_OVERRIDE: 'https://s3.example.com',
      }),
    ).toThrow(/S3_ENDPOINT_OVERRIDE/);
  });
});

describe('background jobs', () => {
  it('runs jobs inside the API unless told otherwise', () => {
    expect(parseEnv('api', apiEnvSchema, valid).BACKGROUND_JOBS).toBe('inline');
    expect(
      parseEnv('api', apiEnvSchema, { ...valid, BACKGROUND_JOBS: 'external' }).BACKGROUND_JOBS,
    ).toBe('external');
    expect(() => parseEnv('api', apiEnvSchema, { ...valid, BACKGROUND_JOBS: 'sometimes' })).toThrow(
      /BACKGROUND_JOBS/,
    );
  });
});
