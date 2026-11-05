# Security review (Phase 10)

- Date: 2026-11-05
- Scope: API (`apps/api`), storefront (`apps/storefront`), admin (`apps/admin`), shared packages
- Method: code review against OWASP ASVS 4.0.3 Level 2, automated tests (below), dependency audit
- Result: no open high or critical findings. Residual risks are listed at the end and in [KNOWN-ISSUES.md](./KNOWN-ISSUES.md).

## Automated evidence

| Check                             | Where                                                                          | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorization matrix              | `apps/api/test/authz-matrix.e2e-spec.ts`, [AUTHZ-MATRIX.md](./AUTHZ-MATRIX.md) | Lists all 121 routes from the running app. Every `/admin` route (except sign-in steps) needs a staff session; every `/account` route needs a customer. Each protected route is called with no token (401), a customer token on admin routes (401) and staff without the permission (403). A route added or changed without updating the matrix fails the build.                                                                                                         |
| Checkout and payment abuse        | `apps/api/test/abuse.e2e-spec.ts`, `payments.e2e-spec.ts`                      | Tampered prices, totals and statuses are ignored. Out-of-range quantities and hidden products are refused. Idempotency keys can't be reused across customers. Payment actions need the private tracking token. Forged, duplicate, wrong-amount and wrong-IP M-Pesa callbacks change nothing. Coupon guessing and order flooding are throttled. 25 buyers racing for 5 units produce exactly 5 orders, and a 3-use coupon raced by 8 buyers is redeemed exactly 3 times. |
| Ownership                         | `checkout.e2e-spec.ts` (keeps orders private), account tests                   | Customers can't read or change other customers' orders, addresses or sessions (404, never 403, so existence isn't revealed).                                                                                                                                                                                                                                                                                                                                            |
| Dependency audit                  | `pnpm audit` (production and dev)                                              | No known vulnerabilities on 2026-11-05.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Accessibility and browser journey | `tests/e2e`                                                                    | See [TESTING.md](./TESTING.md).                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## ASVS chapters

**V1 Architecture.**

- Modular monolith with one enforcement point: the API (ADR 0002). Frontends hide what a user can't do but never decide.
- Secrets live only in server environment variables, validated at startup. Browser bundles get only `NEXT_PUBLIC_*` / `VITE_*` values, none secret.

**V2 Authentication.**

- Argon2id (m=19456, t=2, p=1), minimum 12 characters.
- Lockout after repeated failures. Responses don't reveal whether an account exists. Login, register and reset are rate-limited and fail closed if Redis is down.
- Staff must use TOTP two-factor; seeds are encrypted with AES-256-GCM; codes can't be replayed in the same step. Staff invites are single-use 72-hour links.
- _Gap:_ passwords aren't checked against breach lists (see known issues).

**V3 Sessions.**

- Access JWTs are short-lived (10 minutes) and kept in memory only.
- Refresh tokens are opaque, stored only as hashes, and sent in HttpOnly cookies scoped to the auth path: `SameSite=Lax` for the storefront, `Strict` for the admin, `Secure` in production.
- Rotation on every refresh, with reuse detection that revokes the whole family.
- Staff sessions end after a fixed 12 hours, and every request re-checks the session row, so revocation is immediate.
- Password reset, suspension and two-factor reset revoke sessions.

**V4 Access control.**

- Permissions come from roles in the database on every staff request (cached up to 60 s; role changes clear the cache).
- Customer resources are always filtered by the session's user id. Guest order tracking needs a 256-bit random token, never the order number alone.
- Admin guard rails: built-in roles are read-only, nobody can change their own access, and the last staff manager can't be removed.

**V5 Validation, sanitization, encoding.**

- Every input goes through shared Zod schemas, which drop unknown fields, so mass assignment isn't possible.
- Rich text (product descriptions, blog posts) is sanitized with an allowlist before storage. Blog drafts preview in a sandboxed iframe.
- JSON-LD escapes `<`. React and Vue escape everything else; the only raw-HTML render points are the sanitized fields.
- SQL uses Prisma queries or the `Prisma.sql` template (parameterised); there's no `$queryRawUnsafe`.
- Email templates escape all values.

**V6 Cryptography.**

- Node's `crypto` for randomness (`randomBytes`), HMAC and AES-GCM. Tokens are compared in constant time.
- No custom crypto, except standard TOTP and the HMAC-derived unsubscribe tokens.

**V7 Errors and logging.**

- One error format, and 500s are generic with a request id.
- Pino with request ids. Redacted fields: authorization headers, cookies, passwords, tokens, phone numbers, and the M-Pesa callback secret in URLs and route parameters (the last was found and fixed in Phase 7).
- Security events are written to an append-only audit log (logins, MFA, role and staff changes, refunds, order changes, settings).

**V8 Data protection.**

- Prices, stock and payment state are server-side truths. Card data never touches the platform (hosted checkout only).
- Phone numbers are masked in payment views, reviews show first name and last initial, and newsletter consent is double opt-in.
- _Gap:_ customers can't yet export or delete their own data.

**V9 Communications.**

- In production the API refuses to start without TLS to Postgres (`sslmode=require`) and Redis (`rediss://`), and with any non-https origins.
- The storefront sends HSTS (2 years, preload).

**V10 Malicious code.**

- Exact dependency versions, install scripts denied by default (`allowBuilds`), and a lockfile.
- Uploads are identified by magic bytes; SVG and HTML are refused.

**V11 Business logic.**

- Totals are recomputed, and an order is refused if the reviewed total differs.
- Every state change is conditional (stock reservation, order transitions, payment settlement, coupon redemption), so races resolve to one winner.
- A payment is confirmed only after an authenticated STK Query, never on the callback alone.
- Late or duplicate money is recorded and queued for refund.

**V12 Files.**

- 8 MB / 8000 px limits. Keys are random UUIDs and never derived from file names.
- Files are stored on a separate media origin (R2) with immutable caching. Only the API holds storage credentials.

**V13 API.**

- CORS allows exact origins only.
- Cookie-authenticated endpoints need the exact `Origin` and an `X-Requested-With` header (CSRF).
- JSON bodies are limited to 100 KB (the abuse suite checks this).
- Swagger is disabled in production.
- Per-IP global rate limit, plus stricter per-route limits; those protecting money or credentials fail closed.

**V14 Configuration.**

- Environment validated at startup, with production-only refusals: simulated payments, the memory mail transport, custom S3 endpoints, and live M-Pesa without `PAYMENTS_LIVE_APPROVED`.
- API security headers via Helmet. Storefront CSP: `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`.
- _Gap:_ storefront scripts still allow `'unsafe-inline'` (see residual risks).

## Residual risks (accepted for the release candidate)

1. **Storefront CSP allows inline scripts.** Pages are prerendered and cached, and Next.js nonces require per-request rendering. Mitigations: no unsanitized HTML, React escaping, JSON-LD escaping, and the API is on another origin with Bearer tokens kept out of storage. Revisit with Next.js SRI/hash support.
2. **No breached-password check.** Add a k-anonymity check (Have I Been Pwned range API) at registration and reset.
3. **Uploaded images aren't re-encoded.** A crafted polyglot could pass the magic-byte check. Risk is low because files are served from the separate media origin with an image content type; re-encoding (e.g. sharp) is recommended in Phase 11.
4. **Rate limits fail open when Redis is down,** except the routes marked "fails closed" in the matrix. There's no WAF or bot management; use Cloudflare in front in production.
5. **Customers can't export or delete their data themselves** (Kenya Data Protection Act 2019). Handled manually by staff for now.
6. **Unsubscribe links derive from `JWT_ACCESS_SECRET`.** Rotating it breaks old links; give it its own secret when rotating.
