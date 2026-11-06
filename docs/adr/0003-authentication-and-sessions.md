# ADR 0003: Authentication, sessions, and CSRF

- Status: accepted (implemented in Phase 5; refined from the original proposal, see "Changes")
- Date: 2026-10-27, updated 2026-10-29

## Decision

- All apps live under one registrable domain (`www.`, `admin.`, `api.`), so auth cookies are same-site.
  - **Interim (Phase 11):** the first deployment uses the hosts' own addresses (`netlify.app`, `onrender.com`), which are different sites. `CROSS_SITE_COOKIES=true` sends the refresh and cart cookies as `SameSite=None; Secure; Partitioned` until a shared domain is set up. The Origin and custom-header checks below then carry the CSRF defence alone.
- **Access token:** 10-minute HS256 JWT (`aud` = `storefront` or `admin`, `sid` = session id), held in memory by the client and sent as a Bearer header. Never stored in localStorage.
- **Refresh token:** 256-bit opaque value in an `HttpOnly` cookie, host-only on the API. `sf_rt` uses `SameSite=Lax` at `Path=/api/v1/auth`; `adm_rt` uses `SameSite=Strict` at `Path=/api/v1/admin/auth`. Cookies are `Secure` in production. Only the SHA-256 hash is stored.
- **Rotation and reuse detection:** every refresh replaces the session row within its family. Presenting an already-rotated token after a 10-second grace window revokes the whole family and is audited. Inside the window the API answers `409 REFRESH_IN_PROGRESS` so concurrent tabs retry instead of being signed out.
- **Session lifetime:** customers get a 30-day sliding window. Staff sessions have a fixed 12-hour absolute expiry.
- **Revocation:** logout, password change and reset revoke sessions in the database and record the session ids in Redis for one access-token lifetime, so already-issued access tokens stop working immediately. Staff requests also re-check the session in the database on every call.
- **CSRF:** cookie-authenticated endpoints (refresh, logout) require an exact `Origin` match for that app (storefront or admin) **and** an `X-Requested-With` header. Cross-site forms can send neither; custom headers also force a CORS preflight against the strict allowlist. All other endpoints use Bearer tokens and are not CSRF-exposed.
- **Staff:** a separate login endpoint, cookie and audience. TOTP two-factor (RFC 6238, verified against the RFC test vectors) is **mandatory for every staff account**:
  - The password step returns only a 5-minute, single-use challenge, limited to 5 code attempts.
  - TOTP seeds are encrypted with AES-256-GCM (`MFA_ENCRYPTION_KEY`), and each code can be used once.
  - These checks fail closed if Redis is unavailable.
- **Authorization:** `@AdminAuth('permission')` checks the user's role permissions (cached for 60 s) on every request. Customer resources are always scoped to the token's user, so another user's records return 404.
- **Passwords:** Argon2id (m=19 MiB, t=2, p=1; rehashed on login if parameters change). Policy: 12–128 characters. A dummy hash is verified for unknown emails to equalise timing.
- **Enumeration:** register, resend-verification and forgot-password always return the same response. Registering an existing email notifies the owner instead.
- **Lockout:** 5 failed passwords lock the account for 15 minutes. Per-IP rate limits apply on login, registration, recovery and two-factor, and fail closed without Redis.
- **Email verification** is required before a customer can sign in. Verification and reset links are single-use (24 h and 1 h), stored as hashes, and stripped from the browser URL once read.

## Changes from the original proposal

- _Double-submit CSRF cookie → Origin + custom header._ Refresh cookies are host-only on `api.<domain>`, so the storefront cannot read a CSRF cookie set by the API. Origin verification plus a custom header is the OWASP-recommended alternative for this setup.
- _Two-factor for "privileged roles" → all staff._ Every staff role can read customer personal data, so the distinction added risk without benefit.

## Rejected alternatives

- Access token in localStorage: exposed to any XSS.
- Next.js BFF proxy for all API calls: doubles hops and couples storefront deploys to auth.
- Recovery codes for lost authenticators: deferred. A super admin can reset a staff member's two-factor (admin UI in Phase 8; the database fields are `mfaEnabledAt` and `mfaSecretEncrypted`).
