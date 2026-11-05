# Electronics Commerce

A premium electronics e-commerce platform for the Kenyan market: a Next.js storefront, a Vue admin dashboard, and a NestJS API on PostgreSQL (Neon), Redis, and Cloudflare R2.

**Status:** Phase 11: deployed (storefront https://eccomerce-laptops.netlify.app, admin https://eccomerce-laptops-admin.netlify.app; API on Render, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)). Release candidate: See [docs/KNOWN-ISSUES.md](docs/KNOWN-ISSUES.md), [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md), [docs/TESTING.md](docs/TESTING.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## Repository layout

```text
apps/
  api/          NestJS 12 REST API (/api/v1, Swagger at /docs)        :4000
  storefront/   Next.js 16 App Router + Tailwind 4                     :3000
  admin/        Vue 3 + Vite 8 + Tailwind 4 + Pinia + TanStack Query   :5173
packages/
  shared-types/   domain enums, permissions, money helpers
  validation/     Zod schemas shared by forms and the API
  configuration/  Zod-validated env per app
  api-client/     typed fetch client
  database/       Prisma 7 schema, migrations, seed, generated client
infrastructure/
  docker/       local Postgres, Redis, RustFS (R2 stand-in), Mailpit
  deployment/   Phase 11
docs/           architecture, data model, environment, design, ADRs
```

## Prerequisites

- Node.js 24 (`.nvmrc`)
- pnpm 12: `corepack enable pnpm`
- Docker (for local Postgres/Redis/RustFS/Mailpit, needed from Phase 2)

## Getting started

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/storefront/.env.example apps/storefront/.env.local
cp apps/admin/.env.example apps/admin/.env
cp packages/database/.env.example packages/database/.env   # add your Neon URLs
pnpm docker:up        # local Postgres 18, Redis, RustFS, Mailpit (needed for tests)
pnpm build && pnpm --filter @repo/api storage:init         # create the local media buckets once
pnpm db:migrate:deploy && pnpm db:seed                     # Neon schema + development data
pnpm dev              # builds shared packages, then starts all three apps
```

| App                       | URL                                 |
| ------------------------- | ----------------------------------- |
| Storefront                | http://localhost:3000               |
| Admin                     | http://localhost:5173               |
| API health                | http://localhost:4000/api/v1/health |
| API docs (non-production) | http://localhost:4000/docs          |

## Scripts (run from the repo root)

| Command                                                                           | What it does                                                                          |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm dev`                                                                        | Build packages, then run the API, background worker, storefront and admin in parallel |
| `pnpm dev:worker`                                                                 | Run only the background worker (releases stock for unpaid orders)                     |
| `pnpm --filter @repo/api admin:create --email you@example.com --name "Your Name"` | Create the first administrator (two-factor is set up at first sign-in)                |
| `pnpm dev:api` / `dev:storefront` / `dev:admin`                                   | Run one app                                                                           |
| `pnpm dev:packages`                                                               | Rebuild shared packages on change                                                     |
| `pnpm build`                                                                      | Production build of everything                                                        |
| `pnpm lint` / `pnpm format:check`                                                 | ESLint / Prettier                                                                     |
| `pnpm typecheck`                                                                  | Type-check every workspace                                                            |
| `pnpm test`                                                                       | Unit and e2e tests in every workspace                                                 |

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Data model](docs/DATA-MODEL.md)
- [Environment variables](docs/ENVIRONMENT.md)
- [Design language](docs/DESIGN.md)
- [Architecture decision records](docs/adr/)
