# Deployment

| Part                                                           | Where                                                                             | Address                                             |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------- |
| Storefront (Next.js)                                           | Netlify site `eccomerce-laptops`                                                  | https://eccomerce-laptops.netlify.app               |
| Admin (static Vue app)                                         | Netlify site `eccomerce-laptops-admin`                                            | https://eccomerce-laptops-admin.netlify.app         |
| API (NestJS, Docker)                                           | Render web service `eccomerce-laptops-api` (Ohio)                                 | https://eccomerce-laptops-api.onrender.com          |
| Worker (emails, stock release, M-Pesa checks, scheduled posts) | Render background worker `eccomerce-laptops-worker`                               | (no address)                                        |
| Database                                                       | Neon `laptopseccommerce` (us-east-2)                                              | pooled URL for the API, direct URL for migrations   |
| Cache, rate limits, job queue                                  | Upstash Redis                                                                     | `rediss://`                                         |
| Product and blog images                                        | Cloudflare R2 `laptops-media-public` (public via r2.dev), `laptops-media-private` | https://pub-1a4e67cdc47a4ba7b5f38d510c23b318.r2.dev |

Secrets live only in the hosting dashboards (and in the git-ignored `.secrets/` folder on the machine that set them up). Nothing secret is in the repository, the Docker image or the frontend bundles.

## API and worker (Render)

The blueprint is [render.yaml](../render.yaml). First time:

1. In Render, choose **New → Blueprint** and connect the GitHub repository `clement645/eccomerce-laptops`.
2. Render reads `render.yaml` and asks for the secret values. Paste them from `.secrets/render.env`: `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `MFA_ENCRYPTION_KEY`, `REVALIDATE_SECRET`, and the `R2_*` values.
3. Apply. Both services build from `infrastructure/docker/api.Dockerfile` and redeploy on every push to `main`.
4. Check https://eccomerce-laptops-api.onrender.com/api/v1/health. It should report `database: up` and `redis: up`.

If Render gives the web service a different address (for example because the name is taken), update `API_PUBLIC_URL` in the environment group, rebuild both frontends with the new `NEXT_PUBLIC_API_URL` / `VITE_API_URL`, and change `connect-src` in `apps/admin/public/_headers`.

The free web plan sleeps after 15 minutes without traffic; the first request afterwards takes about a minute. Use a paid plan before taking real orders.

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
- move the API to a paid Render plan so it doesn't sleep.

## Rotating credentials

| Credential           | Where to rotate                                                                                    | Then update                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Neon password        | Neon console → Roles → reset password                                                              | Render `DATABASE_URL`, GitHub secret `NEON_DIRECT_DATABASE_URL`        |
| Upstash token        | Upstash console → reset password                                                                   | Render `REDIS_URL`                                                     |
| R2 access keys       | Cloudflare → R2 → Manage API tokens                                                                | Render `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`                      |
| Cloudflare API token | Cloudflare → My Profile → API Tokens (only used once to enable the r2.dev address; can be deleted) | none                                                                   |
| `JWT_ACCESS_SECRET`  | Generate a new one                                                                                 | Render (signs everyone out; also changes newsletter unsubscribe links) |
| `MFA_ENCRYPTION_KEY` | Don't rotate casually: every staff member must re-enrol two-factor                                 | Render                                                                 |
