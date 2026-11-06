# Environment variables

Each app validates its environment at startup with Zod schemas from `@repo/configuration`. Missing or malformed values stop the process with a clear error instead of failing later.

Templates: `apps/api/.env.example`, `apps/storefront/.env.example`, `apps/admin/.env.example`. Copy each to `.env` (API, admin) or `.env.local` (storefront). Real `.env*` files are git-ignored.

**Only variables prefixed `NEXT_PUBLIC_` or `VITE_` reach the browser. Never put a secret in them.**

## API (`apps/api`)

| Variable                                                                                | Required                     | Phase | Description                                                                                                                                                                                |
| --------------------------------------------------------------------------------------- | ---------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                                                                              | yes                          | 1     | `development` / `test` / `production`                                                                                                                                                      |
| `PORT`                                                                                  | no (4000)                    | 1     | HTTP port                                                                                                                                                                                  |
| `LOG_LEVEL`                                                                             | no (`info`)                  | 1     | Pino level                                                                                                                                                                                 |
| `API_PUBLIC_URL`                                                                        | yes                          | 1     | e.g. `https://api.example.co.ke`. Used to build callback URLs.                                                                                                                             |
| `CORS_ORIGINS`                                                                          | yes                          | 1     | Comma-separated allowlist, e.g. `https://www.example.co.ke,https://admin.example.co.ke`                                                                                                    |
| `DATABASE_URL`                                                                          | yes                          | 2     | Neon **pooled** connection string (`-pooler` host, `sslmode=require`)                                                                                                                      |
| `DATABASE_POOL_MAX`                                                                     | no (`10`)                    | 2     | Prisma connection pool size per process                                                                                                                                                    |
| `DIRECT_DATABASE_URL`                                                                   | yes                          | 2     | Neon **direct** connection string. Used only by `@repo/database` (migrations, seed), not by the API                                                                                        |
| `REDIS_URL`                                                                             | yes                          | 2     | `rediss://` URL of the managed Redis                                                                                                                                                       |
| `REDIS_KEY_PREFIX`                                                                      | no (`ecommerce`)             | 2     | Namespace for every Redis key                                                                                                                                                              |
| `RATE_LIMIT_PER_MINUTE`                                                                 | no (`300`)                   | 2     | Baseline per-IP requests per minute; sensitive routes add stricter limits                                                                                                                  |
| `JWT_ACCESS_SECRET`                                                                     | yes                          | 5     | ≥ 32 random characters (`openssl rand -base64 48`)                                                                                                                                         |
| `JWT_ACCESS_TTL_SECONDS`                                                                | no (`600`)                   | 5     | Access token lifetime                                                                                                                                                                      |
| `REFRESH_TOKEN_TTL_DAYS`                                                                | no (`30`)                    | 5     | Customer sliding session lifetime                                                                                                                                                          |
| `ADMIN_SESSION_TTL_HOURS`                                                               | no (`12`)                    | 5     | Fixed staff session lifetime                                                                                                                                                               |
| `MFA_ENCRYPTION_KEY`                                                                    | yes                          | 5     | 32 bytes, base64 (`openssl rand -base64 32`). Encrypts staff TOTP seeds; keep a secure backup, because losing it invalidates enrolled authenticators                                       |
| `R2_ACCOUNT_ID`                                                                         | production                   | 8     | Cloudflare account ID (32 hex characters). Builds the R2 endpoint                                                                                                                          |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`                                             | for uploads                  | 8     | R2 API token scoped to the buckets below. Set together with `R2_PUBLIC_BUCKET`; without them, image upload returns 503                                                                     |
| `R2_PUBLIC_BUCKET` / `R2_PRIVATE_BUCKET`                                                | public: for uploads          | 8     | Bucket names. The public bucket is served through `R2_PUBLIC_BASE_URL`; the private one is reserved for later (invoices)                                                                   |
| `R2_PUBLIC_BASE_URL`                                                                    | with uploads                 | 3     | Public origin of the media bucket, e.g. `https://media.example.co.ke` (R2 custom domain). Locally `http://localhost:9000/media-public`                                                     |
| `S3_ENDPOINT_OVERRIDE`                                                                  | dev only                     | 8     | `http://localhost:9000` for RustFS. Refused in production. Run `pnpm --filter @repo/api storage:init` once to create the local buckets                                                     |
| `PAYMENTS_SIMULATED`                                                                    | no (`false`)                 | 6     | Development only: simulated M-Pesa with test buttons on the order page. Refused in production; takes precedence over Daraja                                                                |
| `MPESA_ENV`                                                                             | no (`sandbox`)               | 7     | `sandbox` / `production`                                                                                                                                                                   |
| `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET`                                          | all five or none             | 7     | Daraja app credentials. Without them (and without simulation) M-Pesa is shown as unavailable                                                                                               |
| `MPESA_SHORTCODE`                                                                       | all five or none             | 7     | Paybill, or the store number for Buy Goods                                                                                                                                                 |
| `MPESA_PASSKEY`                                                                         | all five or none             | 7     | Lipa na M-Pesa Online passkey                                                                                                                                                              |
| `MPESA_CALLBACK_SECRET`                                                                 | all five or none             | 7     | 24–128 URL-safe characters; secret path segment of the callback URL (defence in depth, _not_ proof of payment)                                                                             |
| `MPESA_TRANSACTION_TYPE`                                                                | no (`CustomerPayBillOnline`) | 7     | or `CustomerBuyGoodsOnline`                                                                                                                                                                |
| `MPESA_PARTY_B`                                                                         | Buy Goods only               | 7     | Till number receiving payment; defaults to `MPESA_SHORTCODE`                                                                                                                               |
| `MPESA_CALLBACK_BASE_URL`                                                               | no (`API_PUBLIC_URL`)        | 7     | Public **https** origin Safaricom calls (a tunnel in development)                                                                                                                          |
| `MPESA_ALLOWED_IPS`                                                                     | no                           | 7     | Comma-separated callback source allowlist. Behind a proxy, `req.ip` must be the real client (see `trust proxy`)                                                                            |
| `PAYMENTS_LIVE_APPROVED`                                                                | for live                     | 7     | Must be `true` for `MPESA_ENV=production`. Set only with the owner's explicit approval                                                                                                     |
| `MAIL_TRANSPORT`                                                                        | no (`smtp`)                  | 5     | `memory` is for automated tests only and is refused in production                                                                                                                          |
| `MAIL_DELIVERY`                                                                         | no (`queue`)                 | 9     | `queue`: emails are queued in Redis and the email consumer sends them with retries (falls back to sending directly if the queue is unreachable). `direct`: sent during the request (tests) |
| `BACKGROUND_JOBS`                                                                       | no (`inline`)                | 11    | `inline`: the API runs the email consumer and maintenance sweeps itself (Render Free). `external`: a separate `dist/worker.js` does. `disabled`: none (tests)                              |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` / `MAIL_FROM` | yes (defaults suit Mailpit)  | 5     | Transactional email (verification, password reset)                                                                                                                                         |
| `STOREFRONT_URL` / `ADMIN_URL`                                                          | yes                          | 5     | Email links, and the exact `Origin` accepted on refresh/logout (CSRF check)                                                                                                                |
| `STOREFRONT_REVALIDATE_URL` / `REVALIDATE_SECRET`                                       | optional (set both)          | 4     | API → storefront `POST /api/revalidate`. Secret ≥ 32 characters, identical in both apps                                                                                                    |

In production the API refuses to start unless `DATABASE_URL` sets `sslmode=require` or `verify-full` and `REDIS_URL` uses `rediss://`.

## Database package (`packages/database/.env`)

| Variable                                                               | Description                                                                                              |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` / `DIRECT_DATABASE_URL`                                 | Neon pooled and direct endpoints (migrations and seed use the direct one)                                |
| `DB_TARGET`                                                            | `remote` (default), `local` or `test`. See [packages/database/README.md](../packages/database/README.md) |
| `LOCAL_DATABASE_URL`, `LOCAL_SHADOW_DATABASE_URL`, `TEST_DATABASE_URL` | Optional overrides of the Docker defaults                                                                |

API integration tests read `TEST_DATABASE_URL` and `TEST_REDIS_URL` (default `redis://localhost:6379/15`).

## Storefront (`apps/storefront`)

| Variable                | Exposure | Phase | Description                                                      |
| ----------------------- | -------- | ----- | ---------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`  | public   | 1     | Canonical origin, used for metadata and sitemap                  |
| `NEXT_PUBLIC_API_URL`   | public   | 1     | Browser-facing API base, e.g. `https://api.example.co.ke/api/v1` |
| `API_INTERNAL_URL`      | server   | 1     | Server-side API base (may equal the public one)                  |
| `NEXT_PUBLIC_MEDIA_URL` | public   | 3     | R2 public media origin                                           |
| `REVALIDATE_SECRET`     | server   | 4     | Shared with the API                                              |

## Admin (`apps/admin`)

| Variable              | Exposure            | Phase | Description                                           |
| --------------------- | ------------------- | ----- | ----------------------------------------------------- |
| `VITE_API_URL`        | public (build-time) | 1     | API base                                              |
| `VITE_STOREFRONT_URL` | public (build-time) | 8     | Optional. "View in store" links in the product editor |

## Local development defaults

`infrastructure/docker/docker-compose.yml` provides:

| Service              | URL                                                          | Credentials                     |
| -------------------- | ------------------------------------------------------------ | ------------------------------- |
| PostgreSQL 18        | `postgresql://ecommerce:ecommerce@localhost:5442/ecommerce`  | dev only                        |
| Redis 7              | `redis://localhost:6379`                                     | none                            |
| RustFS (R2 stand-in) | API `http://localhost:9000`, console `http://localhost:9001` | `devaccesskey` / `devsecretkey` |
| Mailpit              | SMTP `localhost:1025`, UI `http://localhost:8025`            | none                            |
