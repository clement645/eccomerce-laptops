# ADR 0006: Admin uploads and order handling

- Status: accepted
- Date: 2026-10-30

## Context

Staff need to upload product and banner images, run orders from payment to delivery, correct stock, and manage each other's access, without weakening the rules the storefront relies on (prices and stock are server-side truths; payment is confirmed by the provider).

## Decisions

**Uploads go through the API, not presigned URLs.**

- The admin sends the file to `POST /admin/media`. The API identifies it from its bytes (JPEG, PNG, WebP, AVIF; never SVG, which can carry scripts), reads its dimensions, and stores it in the public bucket under a random key with immutable caching.
- Images are limited to 8 MB and 8000 px per side.
- Products, categories, brands and banners can only reference keys recorded in `media_assets`, so nobody can point the storefront at an arbitrary path.
- Trade-off: uploads pass through the API's bandwidth. That's fine for staff-sized traffic, and it avoids bucket CORS and lets the server check content before anything is stored.
- Storage speaks S3 (`aws4fetch`, no SDK): Cloudflare R2 in production, RustFS locally.

**Fulfilment is a small state machine.**

- The steps are `PENDING → PROCESSING → PACKED → SHIPPED → DELIVERED` (`FULFILLMENT_TRANSITIONS` in `@repo/shared-types`).
- Payment rules on top:
  - Prepaid orders (M-Pesa) can't start until paid.
  - Cash-on-delivery orders can ship unpaid, but the cash must be recorded before the order counts as delivered.
  - Shipping requires a courier. Shipping and delivery email the customer.
- Each change is a conditional update on the current status, so concurrent clicks give one success and one `409 ORDER_CHANGED`.

**Cancelling undoes stock and money explicitly.**

- Held stock is released.
- Stock already sold goes back on hand (`RETURN` movement) unless staff untick "put back on sale".
- Money received is queued as a refund for the amount not already refunded. A second staff member records it once the money is sent (ADR 0005).
- Shipped orders can't be cancelled.

**Stock adjustments never undercut open orders.**

- `onHand + delta >= reserved` is part of the update itself, so stock reserved for unpaid orders can't be adjusted away.
- Every adjustment records a reason (restock, return, damage, correction with a note) and the staff member.

**Access management has guard rails.**

- Staff are invited by email with a single-use, 72-hour set-password link, and enrol two-factor at first sign-in.
- Built-in roles are read-only.
- Nobody changes their own roles or status.
- A change that would leave no active account able to manage staff is refused.
- Suspending a customer or staff member revokes their sessions immediately.

## Consequences

- Product edits never delete variants (they're switched off), because orders and stock history refer to them.
- Dashboard revenue counts money received in the period less refunds sent on those payments, by payment date in Nairobi time. It's computed live; add a reporting table if this becomes slow.
