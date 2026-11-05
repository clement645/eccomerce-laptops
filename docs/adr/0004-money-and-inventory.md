# ADR 0004: Money in integer minor units, reservation-based inventory

- Status: accepted
- Date: 2026-10-27

## Decision

- Store all amounts as integer KES cents (`Int`) with `CHECK >= 0`. Aggregates are computed as `bigint` in SQL. No floats.
- Prices are VAT-inclusive. Order items snapshot name, SKU, price, tax rate, and tax amount.
- Inventory uses `on_hand` and `reserved` columns with DB check constraints. Reservation is a single conditional `UPDATE ... WHERE on_hand - reserved >= q` inside the order transaction. Reservations expire (15 min) and are released by a queue job plus a periodic sweeper.

## Why

A conditional atomic update avoids lost-update races without long-held row locks. The check constraints are a last line of defence if application logic is ever wrong.

## Implementation notes (Phase 6)

- **Pricing** is a pure function ([pricing.ts](../../apps/api/src/modules/checkout/pricing.ts)). Prices are VAT-inclusive, so VAT is extracted per line and from delivery. Free delivery applies at a threshold measured after discounts. The total is rounded up to whole shillings (`roundingMinor`, 0–99).
- **Placing an order** is one transaction:
  1. Re-read the cart.
  2. Price on the server and compare with the total the customer reviewed (`PRICE_CHANGED` if different).
  3. Insert the order with line snapshots.
  4. Reserve stock **last**: `UPDATE inventory SET reserved = reserved + q WHERE "onHand" - reserved >= q`, one variant at a time in `variantId` order.

  Reserving last keeps row locks to the final few statements. Locking in a fixed order prevents deadlocks.

- **Only the transaction client is used inside a transaction.** An early version looked up delivery rates with the shared client mid-transaction. Under concurrent checkouts every transaction held one pooled connection while waiting for a second, so the pool deadlocked until timeout. The concurrency test caught it.
- **Payment outcomes** go through `OrderPaymentService`. Every transition is conditional on the order still being `PENDING`, so duplicate callbacks and racing timeouts are no-ops:
  - **Paid:** `onHand -= q`, `reserved -= q`, reservation `CONSUMED`, `SALE` movement.
  - **Failed or expired:** `reserved -= q`, reservation `RELEASED`, order cancelled.
  - **Cash on delivery:** stock is consumed at order time.
- **Expiry:** the worker's BullMQ scheduler runs `releaseExpired` every minute. A payment that arrives after expiry is refused (`ORDER_NOT_PAYABLE`) for manual review rather than silently re-reserving stock.
- **Verified by test:** 8 concurrent checkouts for the last 3 units produce exactly 3 orders and 5 `OUT_OF_STOCK`, with `onHand = 3, reserved = 3`. It passed on 6 consecutive runs.
