# @repo/database

Prisma 7 schema, migrations, seed data and the generated client for PostgreSQL (Neon in production, Docker locally).

## Which database does a command use?

The Prisma CLI picks its target from `DB_TARGET` (see [src/database-url.ts](src/database-url.ts)):

| `DB_TARGET`        | URL used                                              | Purpose                                                     |
| ------------------ | ----------------------------------------------------- | ----------------------------------------------------------- |
| `remote` (default) | `DIRECT_DATABASE_URL`, else `DATABASE_URL`            | Neon. Migrations need the **direct** (non-pooled) endpoint. |
| `local`            | `LOCAL_DATABASE_URL` (Docker `ecommerce`) + shadow DB | Authoring migrations                                        |
| `test`             | `TEST_DATABASE_URL` (Docker `ecommerce_test`)         | Integration tests                                           |

At runtime the API always uses `DATABASE_URL`: Neon's **pooled** endpoint.

## Workflow

```bash
pnpm docker:up                                   # local Postgres 18 + Redis
# 1. Edit prisma/schema.prisma
pnpm db:migrate:create --name add_something      # generate SQL against local Docker (not applied)
# 2. Review/edit the SQL in prisma/migrations/<timestamp>_add_something/
pnpm db:migrate:dev                              # apply locally
pnpm db:generate                                 # refresh the client
pnpm db:migrate:deploy                           # apply to Neon (safe: never resets)
pnpm db:seed                                     # idempotent development seed (Neon)
```

Never run `prisma migrate dev`, `migrate reset` or `db push` against Neon. Production schema changes go through `migrate deploy` only.

## Hand-written SQL

Prisma cannot model these, so they live in hand-written migration SQL, chiefly [prisma/migrations/20261028055400_constraints_and_search](prisma/migrations/20261028055400_constraints_and_search/migration.sql). Prisma ignores them when diffing, so later migrations leave them in place (verified: a follow-up `migrate dev` produced an empty migration).

- **CHECK constraints (46):** non-negative money; `compareAtPriceMinor > priceMinor`; `0 <= reserved <= onHand`; order total = subtotal − discount + shipping + rounding; line total = unit × qty − discount; coupon value shape; rating 1–5; date windows; and more.
- **Search triggers:** `products."searchVector"` (weights: A = name and brand, B = short description and spec values, C = description), kept fresh when a product, its specifications or its brand name change.

- **Catalog projection triggers** ([20261029053830_catalog_projection](prisma/migrations/20261029053830_catalog_projection/migration.sql)): `products."priceMinor"`, `"compareAtPriceMinor"` (from the default active variant) and `"availableQuantity"` (sum of `onHand - reserved` over active variants) are recomputed whenever a variant or inventory row changes. They're used for price and stock filtering and sorting, and are never written by application code.

Partial unique indexes (one default address, one default variant, one active cart, one paid payment per order, county/town shipping rates) are declared in `schema.prisma` with the `partialIndexes` preview feature.

## Seed data

`prisma/seed/` is idempotent: it upserts by natural keys, never resets stock that already exists, and never overwrites store settings an admin has edited. Product prices are illustrative and should be reviewed before launch. Reviews, ratings and testimonials are never seeded.

## Tests

`pnpm --filter @repo/database test` runs against the Docker test database and proves the reservation update cannot oversell under concurrency, plus the constraints and search triggers.
