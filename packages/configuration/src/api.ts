import { z } from 'zod';
import { nodeEnvSchema, originListSchema } from './parse.js';

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/, message: 'Must be a postgresql:// URL' });
const redisUrl = z.url({ protocol: /^rediss?$/, message: 'Must be a redis:// or rediss:// URL' });

/**
 * API environment. Variables needed by later phases are added here as those phases land,
 * so a deployment never requires secrets for features that do not exist yet.
 */
export const apiEnvSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    API_PUBLIC_URL: z.url({ protocol: /^https?$/ }),
    CORS_ORIGINS: originListSchema,

    /** Neon pooled connection string (runtime). Migrations use DIRECT_DATABASE_URL via @repo/database. */
    DATABASE_URL: postgresUrl,
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

    REDIS_URL: redisUrl,
    /** Namespace for every Redis key, e.g. ecommerce:product:{id}. */
    REDIS_KEY_PREFIX: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .default('ecommerce'),

    /**
     * Public origin of the media bucket (Cloudflare R2 custom domain), e.g. https://media.example.co.ke.
     * Optional until uploads exist (Phase 8); without it, image URLs are null and the storefront
     * shows illustrations.
     */
    R2_PUBLIC_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
    /** Object storage for uploads (Cloudflare R2; RustFS locally). Set the credentials and bucket together. */
    R2_ACCOUNT_ID: z
      .string()
      .regex(/^[a-f0-9]{32}$/, 'Cloudflare account IDs are 32 hex characters')
      .optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    R2_PUBLIC_BUCKET: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, 'Invalid bucket name')
      .optional(),
    R2_PRIVATE_BUCKET: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, 'Invalid bucket name')
      .optional(),
    /** S3-compatible endpoint instead of R2, e.g. http://localhost:9000 for RustFS. */
    S3_ENDPOINT_OVERRIDE: z.url({ protocol: /^https?$/ }).optional(),

    /** Baseline per-IP request budget per minute. Sensitive routes declare stricter limits. */
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),

    /**
     * Storefront on-demand revalidation hook, e.g. https://www.example.co.ke/api/revalidate.
     * When catalog or content changes, the API asks the storefront to refresh cached pages.
     * Optional: without it, storefront caches expire on their own schedule.
     */
    STOREFRONT_REVALIDATE_URL: z.url({ protocol: /^https?$/ }).optional(),
    REVALIDATE_SECRET: z.string().min(32, 'Use at least 32 random characters').optional(),

    // ── Authentication (Phase 5) ────────────────────────────────────────────
    /** HMAC key for access tokens. At least 32 random characters. */
    JWT_ACCESS_SECRET: z.string().min(32, 'Use at least 32 random characters'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(600),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24).default(12),
    /** 32-byte key (base64) used to encrypt TOTP secrets with AES-256-GCM. */
    MFA_ENCRYPTION_KEY: z
      .string()
      .refine((value) => base64ByteLength(value) === 32, 'Must be 32 bytes, base64-encoded'),
    /** Used in email links. */
    STOREFRONT_URL: z.url({ protocol: /^https?$/ }),
    ADMIN_URL: z.url({ protocol: /^https?$/ }),

    // ── Email ──────────────────────────────────────────────────────────────
    /** smtp for real delivery (Mailpit locally); memory for automated tests only. */
    MAIL_TRANSPORT: z.enum(['smtp', 'memory']).default('smtp'),
    /** queue: emails are sent by the worker with retries. direct: sent in the request (tests). */
    MAIL_DELIVERY: z.enum(['queue', 'direct']).default('queue'),

    // ── Background jobs ────────────────────────────────────────────────────
    /**
     * inline: the API process runs the email consumer and maintenance sweeps (one service, e.g. Render Free).
     * external: a separate worker process (dist/worker.js) runs them. disabled: neither (tests).
     */
    BACKGROUND_JOBS: z.enum(['inline', 'external', 'disabled']).default('inline'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().min(3).default('Laptops & Electronics <no-reply@localhost>'),

    // ── Payments ───────────────────────────────────────────────────────────
    /** Development only: M-Pesa payments are simulated and confirmed with a test endpoint. */
    PAYMENTS_SIMULATED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    // ── M-Pesa (Daraja). Set all of the credentials or none of them. ─────────
    MPESA_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
    MPESA_CONSUMER_KEY: z.string().min(1).optional(),
    MPESA_CONSUMER_SECRET: z.string().min(1).optional(),
    /** Business short code (Paybill, or the store number for Buy Goods). */
    MPESA_SHORTCODE: z
      .string()
      .regex(/^\d{5,7}$/, 'Must be a 5–7 digit short code')
      .optional(),
    MPESA_PASSKEY: z.string().min(1).optional(),
    MPESA_TRANSACTION_TYPE: z
      .enum(['CustomerPayBillOnline', 'CustomerBuyGoodsOnline'])
      .default('CustomerPayBillOnline'),
    /** Till number receiving Buy Goods payments. Defaults to MPESA_SHORTCODE. */
    MPESA_PARTY_B: z
      .string()
      .regex(/^\d{5,7}$/, 'Must be a 5–7 digit till or short code')
      .optional(),
    /** Random path segment for the callback URL. Defence in depth only; payments are confirmed by STK Query. */
    MPESA_CALLBACK_SECRET: z
      .string()
      .regex(/^[A-Za-z0-9_-]{24,128}$/, 'Use 24–128 URL-safe characters')
      .optional(),
    /** Public https origin Safaricom calls back (e.g. a tunnel in development). Defaults to API_PUBLIC_URL. */
    MPESA_CALLBACK_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
    /** Optional comma-separated allowlist of callback source IPs (Safaricom publishes these). */
    MPESA_ALLOWED_IPS: z
      .string()
      .optional()
      .transform((v) =>
        (v ?? '')
          .split(',')
          .map((ip) => ip.trim())
          .filter(Boolean),
      ),
    /** Explicit sign-off required before MPESA_ENV=production can move real money. */
    PAYMENTS_LIVE_APPROVED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    const mpesaKeys = [
      'MPESA_CONSUMER_KEY',
      'MPESA_CONSUMER_SECRET',
      'MPESA_SHORTCODE',
      'MPESA_PASSKEY',
      'MPESA_CALLBACK_SECRET',
    ] as const;
    const mpesaSet = mpesaKeys.filter((key) => env[key] !== undefined);
    if (mpesaSet.length > 0 && mpesaSet.length < mpesaKeys.length) {
      for (const key of mpesaKeys.filter((k) => env[k] === undefined))
        issue(key, 'Set all M-Pesa credentials together, or none of them');
    }
    if (mpesaSet.length === mpesaKeys.length) {
      const callbackBase = env.MPESA_CALLBACK_BASE_URL ?? env.API_PUBLIC_URL;
      if (!env.PAYMENTS_SIMULATED && !callbackBase.startsWith('https://'))
        issue('MPESA_CALLBACK_BASE_URL', 'Safaricom only calls https URLs (use a tunnel locally)');
    }
    const storageSet = [env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY, env.R2_PUBLIC_BUCKET];
    if (storageSet.some(Boolean)) {
      if (!storageSet.every(Boolean))
        issue(
          'R2_ACCESS_KEY_ID',
          'Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_PUBLIC_BUCKET together',
        );
      if (!env.R2_ACCOUNT_ID && !env.S3_ENDPOINT_OVERRIDE)
        issue('R2_ACCOUNT_ID', 'Set R2_ACCOUNT_ID (or S3_ENDPOINT_OVERRIDE for a local store)');
      if (!env.R2_PUBLIC_BASE_URL)
        issue('R2_PUBLIC_BASE_URL', 'Uploaded images need a public base URL');
    }
    if (env.MPESA_ENV === 'production' && !env.PAYMENTS_LIVE_APPROVED)
      issue(
        'PAYMENTS_LIVE_APPROVED',
        'Live M-Pesa needs explicit approval (PAYMENTS_LIVE_APPROVED=true)',
      );
    if (Boolean(env.STOREFRONT_REVALIDATE_URL) !== Boolean(env.REVALIDATE_SECRET)) {
      issue('REVALIDATE_SECRET', 'Set STOREFRONT_REVALIDATE_URL and REVALIDATE_SECRET together');
    }
    if (env.NODE_ENV !== 'production') return;
    if (!env.API_PUBLIC_URL.startsWith('https://'))
      issue('API_PUBLIC_URL', 'Must use https in production');
    if (env.CORS_ORIGINS.some((origin) => !origin.startsWith('https://'))) {
      issue('CORS_ORIGINS', 'Origins must use https in production');
    }
    const sslmode = new URL(env.DATABASE_URL).searchParams.get('sslmode');
    if (sslmode !== 'require' && sslmode !== 'verify-full') {
      issue('DATABASE_URL', 'Must set sslmode=require or sslmode=verify-full in production');
    }
    if (env.MAIL_TRANSPORT === 'memory')
      issue('MAIL_TRANSPORT', 'The memory transport is for tests only');
    if (env.PAYMENTS_SIMULATED)
      issue('PAYMENTS_SIMULATED', 'Simulated payments cannot be enabled in production');
    if (!env.STOREFRONT_URL.startsWith('https://'))
      issue('STOREFRONT_URL', 'Must use https in production');
    if (!env.ADMIN_URL.startsWith('https://')) issue('ADMIN_URL', 'Must use https in production');
    if (env.S3_ENDPOINT_OVERRIDE)
      issue('S3_ENDPOINT_OVERRIDE', 'Use Cloudflare R2 (R2_ACCOUNT_ID) in production');
    if (!env.REDIS_URL.startsWith('rediss://'))
      issue('REDIS_URL', 'Must use TLS (rediss://) in production');
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Whether uploads can be stored (object storage credentials are configured). */
export function storageConfigured(env: ApiEnv): boolean {
  return Boolean(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_PUBLIC_BUCKET);
}

/** How M-Pesa payments are processed: simulated (development), through Daraja, or not offered. */
export function mpesaMode(env: ApiEnv): 'simulated' | 'daraja' | 'disabled' {
  if (env.PAYMENTS_SIMULATED) return 'simulated';
  return env.MPESA_CONSUMER_KEY ? 'daraja' : 'disabled';
}

/** Decoded length of a base64 string, or -1 if it is not valid base64. Works in Node and browsers. */
function base64ByteLength(value: string): number {
  try {
    return atob(value).length;
  } catch {
    return -1;
  }
}
