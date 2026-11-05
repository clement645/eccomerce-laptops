# Architecture

Premium electronics e-commerce platform for the Kenyan market (KES, M-Pesa first).

Related documents:

- [ROADMAP.md](./ROADMAP.md): phased implementation plan
- [DATA-MODEL.md](./DATA-MODEL.md): initial database entities
- [ENVIRONMENT.md](./ENVIRONMENT.md): environment variables per application
- [DESIGN.md](./DESIGN.md): visual language and design tokens
- [adr/](./adr/): architecture decision records

## 1. System overview

```text
                 ┌────────────────────────┐        ┌────────────────────────┐
  Customers ───► │ Storefront (Next.js)   │        │ Admin (Vue 3 + Vite)   │ ◄─── Staff
                 │ Netlify, SSR/ISR       │        │ Netlify, static SPA    │
                 │ www.<domain>           │        │ admin.<domain>         │
                 └──────────┬─────────────┘        └──────────┬─────────────┘
         server-side fetch  │  browser fetch (credentials)    │ browser fetch (credentials)
                            ▼                                 ▼
                 ┌──────────────────────────────────────────────────────────┐
                 │ API (NestJS, REST, /api/v1)        api.<domain>          │
                 │  ├─ HTTP process  (controllers → services → Prisma)      │
                 │  └─ Worker process (BullMQ: emails, payment reconcile,   │
                 │                     reservation expiry, image variants)  │
                 └───────┬───────────────────┬──────────────────┬───────────┘
                         │                   │                  │
                ┌────────▼───────┐  ┌────────▼───────┐  ┌───────▼──────────┐
                │ Neon Postgres  │  │ Managed Redis  │  │ Cloudflare R2    │
                │ source of truth│  │ cache, limits, │  │ public media     │
                │ (Prisma)       │  │ queues, locks  │  │ bucket + CDN     │
                └────────────────┘  └────────────────┘  └──────────────────┘
                         ▲
                         │  STK Push / STK Query (outbound), callbacks (inbound)
                ┌────────┴───────┐
                │ Safaricom      │
                │ Daraja         │
                └────────────────┘
```

### How the pieces communicate

| From → To                | Mechanism                                                                          | Notes                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storefront server → API  | `fetch` from React Server Components and route handlers, over the public HTTPS API | Catalog/CMS pages use ISR (`revalidate`) and tag-based on-demand revalidation triggered by the API when admins edit content.                                                        |
| Storefront browser → API | `fetch` with `credentials: 'include'` through `@repo/api-client`                   | Cart, checkout, account, and search autocomplete. TanStack Query manages client state.                                                                                              |
| Admin browser → API      | `fetch` with `credentials: 'include'` through `@repo/api-client`                   | All admin endpoints are under `/api/v1/admin/*` and guarded by an admin session, MFA, and per-permission checks.                                                                    |
| API → Postgres           | Prisma Client against Neon's **pooled** URL                                        | Migrations run against Neon's **direct** URL. Critical writes use interactive transactions and row-level locking.                                                                   |
| API → Redis              | `ioredis`                                                                          | Namespaced keys `ecommerce:<area>:<id>`. Cache, rate limiting, checkout state, locks, and BullMQ queues. Never the only copy of orders or payments.                                 |
| API → R2                 | AWS S3 SDK (R2 is S3-compatible)                                                   | The API issues short-lived presigned `PUT` URLs. Browsers upload directly to R2, and the API verifies the object before linking it to a record.                                     |
| Browser → R2 media       | Public bucket on a custom domain (`media.<domain>`) behind Cloudflare's CDN        | Only optimized public assets live there. Private files (e.g. future invoices) go in a separate private bucket and are served with presigned `GET` URLs.                             |
| API ↔ Daraja             | Outbound OAuth + STK Push + STK Query, inbound callback                            | The callback only _triggers_ reconciliation. An order is marked paid only after the API confirms the result with STK Query and matches amount, short code, and checkout request ID. |
| API → Email provider     | Worker job via SMTP/HTTP provider                                                  | Mailpit locally.                                                                                                                                                                    |

## 2. Domains and authentication (critical decision)

Browsers increasingly block third-party cookies. If the storefront ran on `*.netlify.app` and the API on `*.onrender.com`, refresh cookies would be cross-site and would silently fail in Safari and Firefox.

**Decision:** all three apps share one registrable domain:

- `www.<domain>`: storefront
- `admin.<domain>`: admin dashboard
- `api.<domain>`: API

Cookies are then _same-site_ (not cross-site) while staying host-only on `api.<domain>`. See [ADR 0003](./adr/0003-authentication-and-sessions.md) for the implemented design (Phase 5), including the CSRF refinement.

Token model:

- **Access token:** short-lived (10 min) JWT held in memory by the client and sent as `Authorization: Bearer`. Because it is never in a cookie, ordinary API calls are not CSRF-exposed.
- **Refresh token:** opaque random value in an `HttpOnly; Secure` cookie scoped to `Path=/api/v1/auth`. The database stores only its SHA-256 hash. Each refresh rotates the token. If an already-used token is presented again, the whole session family is revoked (reuse detection).
- **CSRF on cookie endpoints** (refresh, logout): `SameSite=Lax` (customer) or `SameSite=Strict` (admin), a strict `Origin` allowlist check, and a required custom header (`X-CSRF-Token`, double-submit).
- **Customer and admin sessions are separate:** different cookie names, different login endpoints, and a session `audience` column. A customer session can never call `/admin/*`.
- **Admins** must enrol TOTP MFA before any privileged permission takes effect. Sensitive actions (refunds, role changes) require recent re-authentication (step-up).
- **Passwords:** Argon2id (`argon2` package; memoryCost 19 MiB, timeCost 2, parallelism 1, per OWASP).

## 3. Backend structure (NestJS)

Modular monolith, with one Nest module per bounded context:

```text
apps/api/src/
  main.ts                 HTTP entry
  worker.ts               BullMQ worker entry (Phase 2+)
  config/                 Zod-validated environment
  common/                 filters, interceptors, guards, decorators, pipes
  infrastructure/         prisma, redis, storage (R2), queue, mail
  modules/
    health/  auth/  users/  catalog/ (products, variants, categories, brands)
    search/  inventory/  cart/  checkout/  orders/  payments/ (providers/mpesa, card, cod)
    shipping/  coupons/  reviews/  content/ (banners, settings, testimonials)
    blog/  newsletter/  notifications/  media/  admin-analytics/  audit/
```

Rules:

- Controllers handle HTTP only: DTO validation, then a call to a service.
- Business logic lives in services. Data access goes through Prisma inside services or small repositories.
- Validation uses Zod schemas from `@repo/validation`, applied with a `ZodValidationPipe`. The same schemas power frontend forms, so the rules cannot drift between client and server.
- Authorization uses guards plus a `@RequirePermission('orders:update')` decorator. Permissions are checked on every admin route, and ownership is checked for customer resources (e.g. `order.userId === session.userId`).
- Errors use one envelope: `{ error: { code, message, details?, requestId } }`.
- Logging: Pino (`nestjs-pino`) with request IDs, and redaction of `authorization`, `cookie`, passwords, and phone numbers.

### Critical flows

**Stock reservation (no overselling)**

1. Checkout opens a transaction and runs `UPDATE inventory SET reserved = reserved + :q WHERE variant_id = :v AND on_hand - reserved >= :q`. If zero rows change, stock is insufficient and the order is not created.
2. The same transaction inserts a `StockReservation` row with `expires_at = now() + 15 min`, linked to the order.
3. Payment confirmed: in one transaction, decrement `on_hand` and `reserved`, mark the reservation `CONSUMED`, and write an `InventoryMovement`.
4. Payment failed, timed out, or abandoned: a BullMQ job (plus a periodic sweeper as a safety net) releases expired reservations, so inventory is never locked permanently.
5. DB check constraints guarantee `on_hand >= 0`, `reserved >= 0`, and `reserved <= on_hand`.

**M-Pesa STK Push** (implemented in Phase 7, see [ADR 0005](adr/0005-payment-verification.md))

1. Checkout validates the phone (`2547XXXXXXXX` / `2541XXXXXXXX`). The amount is the server-side order total, never a client value.
2. The order transaction creates a `PaymentAttempt` (`INITIATED`, unique idempotency key). The STK Push is sent **after** commit, so no row locks are held across a network call.
3. The push result stores `MerchantRequestID` and `CheckoutRequestID` (unique) and moves the attempt to `PENDING`. If the push fails, the attempt is marked `FAILED` and the customer can request a new prompt.
4. Callback: store the raw payload as a `PaymentEvent` (deduplicated), call **STK Query**, apply its result and answer `200`.
   - The order becomes `PAID` (stock consumed, receipt stored) only when STK Query reports success.
   - The receipt is stored only when the callback amount equals the attempt amount.
5. No callback: the worker polls STK Query with backoff. After 3 minutes without an answer the attempt is `TIMED_OUT`, and stock is released when the order's hold expires.
6. Money confirmed for a paid or cancelled order is recorded and a full refund is queued for staff.

## 4. Frontends

**Storefront (Next.js App Router):**

- Server components by default. Client components only where interaction is needed (cart drawer, gallery, filters, checkout forms).
- Catalog and CMS pages are ISR-cached and revalidated by tag when the API signals a change.
- SEO via the Metadata API, JSON-LD (`Product`, `BreadcrumbList`, `Organization`), `sitemap.ts`, and `robots.ts`.
- Images through `next/image`, served from the public R2 bucket (`NEXT_PUBLIC_MEDIA_URL`) and resized by Next.js.

**Storefront data loading (implemented in Phase 3):**

- Each page's static shell (header, skeletons) is prerendered. Data streams in through `<Suspense>`.
- Data functions in [apps/storefront/src/lib/data.ts](../apps/storefront/src/lib/data.ts) use `'use cache'` with `cacheLife('minutes')` and `cacheTag(...)`, behind `await connection()`. So `next build` never needs the API (CI and Netlify builds stay independent), while visitors still get cached responses. On-demand revalidation by tag is wired from the API in Phase 4.
- `GET /storefront/layout` (navigation and public settings) and `GET /storefront/homepage` are aggregated, Redis-cached endpoints, invalidated with `StorefrontService.invalidate()`.
- If the API is unreachable, the header and footer fall back to defaults and the page shows a retry screen; nothing crashes.

**Catalog (implemented in Phase 4):**

- `GET /catalog/products` filters by category (including subcategories), brand, condition, price (whole KES), stock, sale, featured and specification (`spec=Key:Value`: OR within a key, AND across keys). It sorts by relevance, newest, price, popularity or rating, paginates, and returns filter counts. The counts reflect the page's scope (search term, category or brand), not the other active filters. The query schema lives in `@repo/validation` and is shared with the storefront's URL parsing.
- **Catalog projection.** `products.priceMinor`, `compareAtPriceMinor` and `availableQuantity` are maintained by database triggers on `product_variants` and `inventory`. Price and stock filters and sorts are then plain indexed columns. Application code never writes them.
- **Search** sits behind `ProductSearchEngine` ([product-search.ts](../apps/api/src/modules/catalog/search/product-search.ts)). The PostgreSQL implementation combines prefix full-text matching (`to_tsquery('simple', 'mac:* & air:*')`), English full-text matching, and `pg_trgm` word similarity on the name for typos ("thinkpd" finds ThinkPad). User input is reduced to letter/digit tokens and passed as bound parameters. A dedicated engine (Meilisearch, Typesense) can replace it without touching the catalog service.
- **Caching and invalidation.** Listings (keyed by a hash of the normalised query), product detail, categories, brands and suggestions are cached in Redis. `CatalogService.invalidate()` bumps the cache namespaces and calls the storefront's `POST /api/revalidate` (shared secret, constant-time compare, allowlisted tags), which runs `revalidateTag(tag, 'max')`. Admin product editing (Phase 8) calls `invalidate()`.
- **Product descriptions** are sanitized by the API (`sanitizeRichText`, an allowlist with no scripts, styles, event handlers or `javascript:` URLs) before the storefront renders them as HTML.
- **Unknown URLs.** Catalog pages stream, so an unknown product, category or brand renders the not-found page with HTTP 200 and `<meta name="robots" content="noindex">`, which Next.js adds automatically. Search engines drop such URLs. A hard 404 status would need a Proxy lookup on every request; it's deferred to Phase 10 if analytics require it.
- **SEO.** Per-page metadata and canonical URLs. Filtered and sorted listing variants are `noindex` and canonicalise to the clean listing, and `/search` is never indexed. JSON-LD covers `Product` (offers in KES, availability, condition; `aggregateRating` only from approved reviews) and `BreadcrumbList`. `sitemap.xml` is built at request time, and `robots.txt` excludes search, cart, checkout and account.

**Cart and checkout (implemented in Phase 6):**

- **Carts:** guests are identified by an HttpOnly `sf_cart` cookie (`Path=/api/v1`; only its hash is stored), customers by their account. The first signed-in request merges a guest cart into the account cart. Carts store variant and quantity only; prices and stock are recomputed on every read, and each line reports any issue (`OUT_OF_STOCK`, `QUANTITY_REDUCED`, `UNAVAILABLE`). Changes require the storefront `Origin` and `X-Requested-With` (CSRF), like the auth cookie endpoints.
- **Checkout:**
  - `POST /checkout/quote` returns delivery options (county rate, town override, free-delivery threshold), payment methods with eligibility reasons, and server totals.
  - `POST /checkout/orders` needs an `Idempotency-Key` and the reviewed `expectedTotalMinor`; see [ADR 0004](./adr/0004-money-and-inventory.md) for the transaction.
  - Order numbers come from a Postgres sequence (`EL-2026-001001`). Guests track orders through an unguessable token link, never by order number alone.
- **Payments:** M-Pesa is **simulated** when `PAYMENTS_SIMULATED=true` (refused in production), with `POST /checkout/orders/:number/simulate-payment` standing in for the Daraja callback. Phase 7 added real STK Push, callbacks and STK Query alongside it (see ADR 0005). Cash on delivery follows the `checkout.cashOnDelivery` setting (enabled, counties, maximum) and each delivery method's `codAllowed`.
- **Worker:** `dist/worker.js` (same image as the API) runs BullMQ consumers. The `maintenance` queue releases stock for unpaid orders every minute.

**Content and engagement (implemented in Phase 9, see [ADR 0007](./adr/0007-content-and-engagement.md)):**

- **Blog:** `/blog` and `/blog/[slug]` with `BlogPosting` JSON-LD and sitemap entries. Staff write HTML that the API sanitizes (`sanitizeRichText`). Publishing needs `blog:publish`. Scheduled posts go live through the worker's `publish-scheduled-posts` job (every minute), which revalidates the `blog`, `post:<slug>` and homepage tags.
- **Reviews:** only customers with a delivered, paid order for the product can review it (`PUT /account/reviews/:slug`). Every review waits for moderation (`reviews:moderate`). `ratingAvg` / `ratingCount` are recomputed from approved reviews only, never entered by hand. Public reviews show a first name and last initial.
- **Coupons:** a percentage (optional cap) or a fixed amount off the goods subtotal, never delivery.
  - Rules: dates, minimum spend, total uses, uses per customer, first order only. The quote checks them for display.
  - At placement, the order transaction locks the coupon row (`FOR UPDATE`) and checks again, so limits hold under concurrent orders.
  - The discount is split across lines (largest remainder) so each line's VAT is right.
  - A cancelled order gives the use back.
- **Newsletter:** double opt-in. The confirmation link expires after 7 days. Unsubscribe links are an HMAC of the subscriber id (stable across emails, never stored). The subscribe endpoint answers the same way whatever the address's state. Staff can export confirmed subscribers as CSV.
- **Contact:** messages are stored and forwarded (Reply-To set to the customer) to the store contact email from settings. There's no automatic reply to the address typed in the form, and a hidden honeypot field files bots as spam.
- **Store settings:** `PUT /admin/settings/:key` for an allowlist of keys, each with its own Zod schema; audited, and the storefront layout is revalidated.
- **Email:** `MailService.send` queues to BullMQ (`email` queue) and the worker delivers with 6 attempts and exponential backoff. If Redis is unreachable it sends directly instead.

**Admin (Vue 3 SPA, implemented in Phase 8):**

- Route guards check session and permissions so the UI can hide what a user cannot do. The API remains the actual enforcement point. Each route declares one permission. The menu shows only the pages a staff member can open, and staff without `dashboard:read` land on their first permitted page.
- TanStack Vue Query handles server state. Pinia holds only session/UI state. List filters live in the URL, so a filtered view can be bookmarked.
- **Screens:**
  - Dashboard (live figures, daily revenue chart with Chart.js, items needing attention).
  - Orders: list, plus a detail page with fulfilment steps, shipping, cancellation, cash collection, refunds and internal notes.
  - Products: list and editor with variants, specifications and image upload.
  - Categories, brands, inventory (adjustments and history), customers.
  - Banners and homepage sections.
  - Staff and roles, the audit log, and the invitation (set-password) page.
- **API:** `/api/v1/admin/*` ([modules/admin](../apps/api/src/modules/admin)).
  - Every write is a conditional update on the current state, so two staff members cannot both apply conflicting changes.
  - Every write is recorded in the audit log.
  - Catalog and content edits clear the API caches and revalidate the storefront (`CatalogChangeNotifier`).
  - See [ADR 0006](./adr/0006-admin-operations.md) for uploads and the order workflow.

## 5. Shared packages

| Package               | Purpose                                                                                                                   | Consumers         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `@repo/shared-types`  | Domain enums and constants (order/payment/fulfillment statuses, permissions, roles), money helpers in integer minor units | all               |
| `@repo/validation`    | Zod schemas (auth, address, phone, checkout, product), shared by forms and API DTOs                                       | all               |
| `@repo/configuration` | Zod env schemas per app, with fail-fast parsing at startup                                                                | all               |
| `@repo/api-client`    | Typed `fetch` client: base URL, credentials, error envelope parsing                                                       | storefront, admin |
| `@repo/database`      | Prisma schema, migrations, seed, generated client (Phase 2)                                                               | api               |

Packages compile to `dist/` (ESM + `.d.ts`). Every app consumes built output, so each app stays independently buildable and deployable.

## 6. Money, tax, currency

- All amounts are **integer minor units** (KES cents) in `Int` columns, with DB check constraints `>= 0`. No floating-point arithmetic anywhere. Aggregates (revenue) are computed in SQL as `bigint` and serialised as strings.
- Prices are **VAT-inclusive** (Kenya VAT 16%, configurable). Each order item stores a snapshot of name, SKU, unit price, tax rate, and tax amount.
- M-Pesa charges whole shillings. Order totals are rounded _up_ to whole shillings at order creation, and the rounding line is stored explicitly.

## 7. Caching (Redis)

| Key                                                        | TTL     | Invalidated by                               |
| ---------------------------------------------------------- | ------- | -------------------------------------------- |
| `ecommerce:product:{id}` / `ecommerce:product:slug:{slug}` | 10 min  | product, variant, price, stock-status change |
| `ecommerce:category:tree`                                  | 1 h     | category change                              |
| `ecommerce:homepage:*`                                     | 5 min   | banner/content/featured change               |
| `ecommerce:search:{hash}`                                  | 2 min   | catalog change (version-prefix bump)         |
| `ecommerce:ratelimit:{scope}:{key}`                        | window  | n/a                                          |
| `ecommerce:checkout:{id}`                                  | 30 min  | checkout completion                          |
| `ecommerce:lock:{name}`                                    | seconds | released by owner                            |

Invalidation bumps a version counter per namespace instead of using `KEYS`/`SCAN` deletes.

## 8. Security baseline

- OWASP ASVS L2 as the target.
- Helmet security headers on the API. CSP and HSTS on both Netlify sites (via `next.config` headers / `netlify.toml`).
- CORS: an explicit allowlist (storefront and admin origins only), `credentials: true`.
- Rate limiting (Redis-backed): login, register, password reset, STK Push, search, contact form.
- Uploads: allowlisted MIME types plus magic-byte check after upload, size limits, UUID keys, re-encoding with `sharp` (which strips EXIF and blocks polyglots).
- Rich text (blog) is sanitized server-side with an allowlist before storage and rendered as trusted HTML only from that sanitized field.
- Least-privilege DB roles: a migration role (DDL) and a runtime role (DML only).
- Public order tracking uses an opaque random `trackingToken`, never sequential IDs.
- An audit log records every admin mutation (actor, action, entity, before/after diff, IP, user agent).
- Secrets live only in host environment variables. Only `NEXT_PUBLIC_*` / `VITE_*` values reach browsers, and those contain no secrets.

## 9. Deployment

| Component    | Host                                         | Notes                                                                                               |
| ------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Storefront   | Netlify (Next.js runtime / OpenNext adapter) | `apps/storefront` base directory                                                                    |
| Admin        | Netlify static                               | SPA fallback redirect `/* /index.html 200`                                                          |
| API + worker | Render / Railway / Fly.io (Docker image)     | Two processes from one image: `node dist/main.js` and `node dist/worker.js`                         |
| Database     | Neon                                         | Pooled URL for runtime, direct URL for migrations, branch-per-preview optional                      |
| Redis        | Redis Cloud or Upstash (fixed plan)          | Must support BullMQ (blocking commands, Lua). Upstash pay-per-request is costly for BullMQ polling. |
| Media        | Cloudflare R2                                | Public media bucket on a custom domain, plus a private bucket                                       |

## 10. Architectural risks

| #   | Risk                                                                                                             | Impact                                              | Mitigation                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **No reference screenshot was received.** Only the text description arrived.                                     | Visual fidelity in Phase 3                          | Tokens are derived from the written description ([DESIGN.md](./DESIGN.md)). Re-check Phase 3 against the screenshot once it is supplied. |
| 2   | Cross-site cookies if apps use default host domains                                                              | Login silently fails in Safari/Firefox              | One registrable domain for all apps (§2). Required before production.                                                                    |
| 3   | Unreliable or spoofed Daraja callbacks                                                                           | Orders marked paid without payment, or never marked | Callback is a trigger only; STK Query confirms. Timeout polling. Unique constraints for idempotency.                                     |
| 4   | Overselling under concurrent checkout                                                                            | Customer trust, refunds                             | Conditional atomic updates + DB check constraints + expiring reservations + concurrency tests.                                           |
| 5   | Neon connection limits and cold starts                                                                           | Latency spikes, `too many connections`              | Pooled URL, small Prisma pool, keep-alive health checks, `connect_timeout`.                                                              |
| 6   | Managed Redis incompatible with or expensive for BullMQ                                                          | Jobs stall, bill shock                              | Choose a fixed-price plan; Redis outage degrades cache but not orders (Postgres is authoritative).                                       |
| 7   | Next.js on Netlify feature parity (ISR, on-demand revalidation, middleware)                                      | Stale catalog                                       | Use tag revalidation via a secured route handler; verify on a Netlify preview in Phase 11.                                               |
| 8   | Fast-moving toolchain (Next 16, Nest 12 ESM, Tailwind 4, Prisma 7, TS 6; TS 7 and Prisma 8 RC already published) | Breakage on upgrade                                 | Exact pinned versions, lockfile, Renovate later. TS pinned at 6.0.x because the Nest CLI and typescript-eslint do not support TS 7 yet.  |
| 9   | Kenya Data Protection Act 2019 (ODPC) obligations                                                                | Legal                                               | Data minimisation, privacy policy, consent for newsletter, PII redaction in logs, retention policy (Phase 10).                           |
| 10  | Scope: the spec is a multi-month platform                                                                        | Quality erosion                                     | Strict phase gates. Each phase ships tested and documented before the next begins.                                                       |
