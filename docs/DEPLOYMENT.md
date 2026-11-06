# Deployment

| Part                                            | Where                                                                             | Address                                             |
| ----------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------- |
| Storefront (Next.js)                            | Netlify site `eccomerce-laptops`                                                  | https://eccomerce-laptops.netlify.app               |
| Admin (static Vue app)                          | Netlify site `eccomerce-laptops-admin`                                            | https://eccomerce-laptops-admin.netlify.app         |
| API (NestJS, Docker), including background jobs | Render **Free** web service `eccomerce-laptops-api` (Ohio)                        | https://eccomerce-laptops-api.onrender.com          |
| Database                                        | Neon `laptopseccommerce` (us-east-2)                                              | pooled URL for the API, direct URL for migrations   |
| Cache, rate limits, email queue                 | Upstash Redis                                                                     | `rediss://`                                         |
| Product and blog images                         | Cloudflare R2 `laptops-media-public` (public via r2.dev), `laptops-media-private` | https://pub-1a4e67cdc47a4ba7b5f38d510c23b318.r2.dev |

Secrets live only in the hosting dashboards (and in the git-ignored `.secrets/` folder on the machine that set them up). Nothing secret is in the repository, the Docker image or the frontend bundles.

## API (Render Free)

The blueprint is [render.yaml](../render.yaml): one free web service and nothing paid. First time:

1. In Render, choose **New → Blueprint** and connect the GitHub repository `clement645/eccomerce-laptops`.
2. Render reads `render.yaml` and asks for the secret values. Paste them from `.secrets/render.env`: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `MFA_ENCRYPTION_KEY`, `REVALIDATE_SECRET`, and the `R2_*` values.
3. Apply. The service builds from `infrastructure/docker/api.Dockerfile` and redeploys on every push to `main`.
4. Check https://eccomerce-laptops-api.onrender.com/api/v1/health. It should report `database: up`, `redis: up` and, under `jobs`, `mode: inline` with a finished `catchUp`.

If a background worker `eccomerce-laptops-worker` was created from an earlier version of the blueprint, delete it in the Render dashboard; it is no longer needed (and was the only paid part).

**Cookies across sites.** The admin and storefront (`netlify.app`) and the API (`onrender.com`) are different sites, so the blueprint sets `CROSS_SITE_COOKIES=true`. Without it browsers drop the sign-in and cart cookies, and staff are signed out on every reload. Cross-site request protection still comes from the exact-`Origin` and `X-Requested-With` checks on every cookie endpoint. Safari may still drop these cookies (see KNOWN-ISSUES); the full fix is your own domain, with `admin.`, `api.` and `www.` under it, and then `CROSS_SITE_COOKIES=false`.

If Render gives the web service a different address (for example because the name is taken), update `API_PUBLIC_URL`, rebuild both frontends with the new `NEXT_PUBLIC_API_URL` / `VITE_API_URL`, and change `connect-src` in `apps/admin/public/_headers`.

### Health checks

| Path                  | Checks                                                                                                                          | Used by                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `/api/v1/health/live` | The process answers (no database or Redis call)                                                                                 | Render's health check      |
| `/api/v1/health`      | Database and Redis (503 if the database is down), plus `jobs`: mode, email consumer, startup catch-up and each sweep's last run | People and uptime monitors |

Render uses the liveness path so that a slow Neon or Upstash moment doesn't make Render restart a healthy process. A sweep whose `ok` is `false` in `/health` shows the last error in `detail`.

### Memory and CPU

Render Free gives 512 MB and 0.1 CPU. The blueprint sets `NODE_OPTIONS=--max-old-space-size=320` (the heap limit, leaving room for native memory) and `DATABASE_POOL_MAX=3`. The email consumer handles two emails at a time and the sweeps run one at a time, so background work never competes much with requests.

## Background jobs on Render Free

Render's background workers have no free plan, so the API process runs the background work itself (`BACKGROUND_JOBS=inline`). Nothing that takes money or stock depends on it.

### What runs where

**Synchronous (inside the HTTP request; works whenever the API is answering):**

| Operation                                                                                      | Notes                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Placing an order                                                                               | One database transaction: totals, stock reservation (conditional update), coupon use, order and payment attempt rows. `Idempotency-Key` makes retries safe. |
| Sending the M-Pesa prompt (STK Push)                                                           | Right after the order commits, in the same request.                                                                                                         |
| M-Pesa callback                                                                                | Stored (deduplicated), then **verified with STK Query** and settled in the same request: order `PAID`, stock consumed.                                      |
| "Retry M-Pesa" / checking a prompt                                                             | Asks Safaricom about the open prompt first, so a payment made while the callback was lost is found immediately.                                             |
| Settlement                                                                                     | Exactly once: the attempt row is claimed by a conditional update, so callback, retry check and sweep can't double-settle.                                   |
| Cash on delivery, admin actions, refunds recorded, cache, rate limits, storefront revalidation | Unchanged.                                                                                                                                                  |

**Queued in Redis (BullMQ, survives restarts and sleep):**

| Job                    | Retries                                   | Duplicates prevented by                                                                                                                                                      |
| ---------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Emails (`email` queue) | 6 attempts, exponential backoff from 10 s | Job id = hash of recipient and content (the same email requested twice is queued once), and a 7-day "sent" marker checked before delivery (a retried job never sends twice). |

If Redis can't be reached when an email is sent, it is delivered directly instead.

**Periodic sweeps inside the process (state in Postgres, no queue, no Redis commands):**

| Sweep                | Every | Does                                                                                                                                                                                                                     |
| -------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `payments-and-holds` | 30 s  | 1. Asks Safaricom about prompts with no answer yet, and gives timed-out prompts one final check after 10 minutes. 2. Then releases stock and cancels orders whose hold expired, never while a prompt is open or unknown. |
| `scheduled-posts`    | 5 min | Publishes blog posts whose publish time has passed.                                                                                                                                                                      |

Both also run once at startup, **before the API accepts requests** (up to 20 s; anything left continues in the background). A sweep never overlaps itself; during a deploy two processes may briefly run, and every update is conditional, so the second changes nothing.

Payment safety rules in the sweep:

- A failed STK Query (Safaricom unreachable) is not a timeout. The attempt stays pending and the order keeps its stock, until Safaricom answers or 24 hours pass (then it is logged for a manual check).
- An order is released only when its hold has expired **and** no prompt is open. So an order paid while the service slept is settled by the startup catch-up, not cancelled.
- Money that arrives after an order was cancelled is recorded and a full refund is queued for staff (as before).

### What happens when Render sleeps

Render Free stops the service after 15 minutes without requests, and starts it again on the next request (about a minute).

- **Before sleeping:** Render sends SIGTERM. The API stops its timers, lets a running sweep or email delivery finish (up to 10 s) while the database and Redis are still connected, then exits.
- **While asleep:** nothing runs. Queued emails (waiting, or waiting to retry) stay in Redis. Stock holds expire in the database but nobody can order meanwhile, since any request wakes the service first. Scheduled posts wait.
- **An M-Pesa callback while asleep** wakes the service. Safaricom may give up waiting during the cold start; the payment is then found by the startup catch-up (and by the customer's retry check), because Postgres still has the open prompt.
- **On wake:** the catch-up runs before the first request is served: payments first, then holds, then posts. The email consumer starts and delivers whatever is waiting; an email that was mid-delivery when the process stopped is retried within about 5 minutes and skipped if it had been sent.
- **If no one visits for days,** emails and scheduled posts wait until the next visit. To avoid that, an external uptime check (for example a free monitor calling `/api/v1/health/live` every 10 minutes) keeps the service awake; one service running all month fits within Render's free instance hours.

### Redis usage

Maintenance no longer uses Redis at all. The email consumer waits for jobs with one blocking call per 30 s and checks for interrupted jobs every 5 minutes, Measured on an idle API: one blocking wait and one small script every 30 s, about 240 commands an hour (roughly 175,000 a month if it never sleeps, less when it does). Requests add their own cache and rate-limit commands, as before. The old BullMQ `maintenance` queue and its schedules are deleted from Redis on the first start of this version.

### Running jobs in a separate process (optional)

With `BACKGROUND_JOBS=external` on the API, run `node dist/worker.js` (same image) elsewhere to do the jobs. `disabled` runs none (tests only).

## Database migrations

Already applied to Neon. For new migrations:

- **From GitHub:** the "Migrate production database" workflow runs on demand and when migrations change on `main`. One-time setup:

  ```bash
  gh api -X PUT repos/clement645/eccomerce-laptops/environments/production
  gh secret set NEON_DIRECT_DATABASE_URL --env production --repo clement645/eccomerce-laptops   # paste the direct (non-pooler) URL
  ```

- **From a machine:** in `packages/database`, set `DB_TARGET=remote` and `DIRECT_DATABASE_URL` in the shell, then run `pnpm exec prisma migrate deploy`.

Seeding production: run `SEED_DEMO=false NODE_ENV=production SEED_ALLOW_PRODUCTION=true pnpm --filter @repo/database seed`. It creates roles, categories, brands, delivery rates and settings, never the demo products or posts.

## First administrator

From any machine that can reach Neon (after `pnpm install && pnpm build`):

```bash
cd apps/api
DATABASE_URL='<pooled Neon URL>' ADMIN_PASSWORD='<a long password>' \
  node dist/cli/create-admin.js --email you@example.com --name "Your Name"
```

Sign in at https://eccomerce-laptops-admin.netlify.app/login and set up two-factor with an authenticator app. Invite everyone else from **Staff & roles**.

## Frontends (Netlify)

Deploys so far were made with the Netlify CLI from a clean checkout, so local `.env` files can never be bundled:

```bash
git worktree add --detach /tmp/deploy HEAD && cd /tmp/deploy && pnpm install --frozen-lockfile

# Storefront (Next.js runtime)
NEXT_PUBLIC_SITE_URL=https://eccomerce-laptops.netlify.app \
NEXT_PUBLIC_API_URL=https://eccomerce-laptops-api.onrender.com/api/v1 \
NEXT_PUBLIC_MEDIA_URL=https://pub-1a4e67cdc47a4ba7b5f38d510c23b318.r2.dev \
netlify deploy --build --prod --site eccomerce-laptops --filter @repo/storefront

# Admin (static)
pnpm --filter "@repo/admin^..." build
cd apps/admin && VITE_API_URL=https://eccomerce-laptops-api.onrender.com/api/v1 \
  VITE_STOREFRONT_URL=https://eccomerce-laptops.netlify.app npx vite build
netlify deploy --prod --dir dist --site eccomerce-laptops-admin --no-build
```

For automatic deploys, link each site to the GitHub repository in Netlify (**Site configuration → Build & deploy → Link repository**):

- Storefront: package directory `apps/storefront`. The build settings come from `apps/storefront/netlify.toml`.
- Admin: base directory `/`, build command `pnpm --filter @repo/admin... build`, publish directory `apps/admin/dist`.
- Then set the variables above as site environment variables.
- Also set `REVALIDATE_SECRET` on the storefront site (the same value as the API's), so admin edits refresh the store immediately instead of after the cache expires.

## Before taking real orders

See [KNOWN-ISSUES.md](./KNOWN-ISSUES.md). In short:

- rotate every credential that was shared in chat;
- archive the demo products (they were seeded in Phase 2);
- add an email provider (`SMTP_*`, `MAIL_FROM`) so account and order emails are sent;
- turn on a way to pay: Daraja production credentials with `PAYMENTS_LIVE_APPROVED=true`, or cash on delivery in Store settings;
- write the delivery, returns and privacy pages;
- optionally, add an uptime check (or a paid plan) so the API doesn't sleep: the first visit after a quiet spell is slow.

## Rotating credentials

| Credential           | Where to rotate                                                                                    | Then update                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Neon password        | Neon console → Roles → reset password                                                              | Render `DATABASE_URL`, GitHub secret `NEON_DIRECT_DATABASE_URL`        |
| Upstash token        | Upstash console → reset password                                                                   | Render `REDIS_URL`                                                     |
| R2 access keys       | Cloudflare → R2 → Manage API tokens                                                                | Render `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`                      |
| Cloudflare API token | Cloudflare → My Profile → API Tokens (only used once to enable the r2.dev address; can be deleted) | none                                                                   |
| `JWT_ACCESS_SECRET`  | Generate a new one                                                                                 | Render (signs everyone out; also changes newsletter unsubscribe links) |
| `MFA_ENCRYPTION_KEY` | Don't rotate casually: every staff member must re-enrol two-factor                                 | Render                                                                 |
