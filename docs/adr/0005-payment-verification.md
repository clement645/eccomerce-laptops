# ADR 0005: Payments are confirmed by provider query, not by callback

- Status: accepted
- Date: 2026-10-27

## Decision

- A payment provider interface (`initiate`, `handleWebhook`, `queryStatus`, `refund`) with M-Pesa, card (hosted checkout), and COD implementations, plus a mock for tests.
- M-Pesa callbacks are stored raw (`PaymentEvent`, deduplicated) and only trigger reconciliation. The order becomes `PAID` only after STK Query confirms success **and** amount, short code, and CheckoutRequestID match the stored attempt.
- Every state change is idempotent, enforced by unique constraints on idempotency key, CheckoutRequestID, and event dedupe key.
- Live credentials are never used without explicit approval.

## Implementation notes (Phase 7)

- **Gateway interface.** `MpesaGateway` (`stkPush`, `stkQuery`) with three implementations, selected from the environment by `mpesaMode()`:
  - `DarajaMpesaGateway`: `fetch` with a 15 s timeout, an OAuth token cached until a minute before it expires, and timestamps in East Africa Time.
  - `SimulatedMpesaGateway` (development): outcomes are kept in Redis, so the API and the worker agree.
  - A fake in the end-to-end tests.

  Card payments have a `CardGateway` contract (hosted checkout, signed webhook, status query, refund) but no provider yet. Cash on delivery stays in `OrderPaymentService`.

- **The order total is the push amount.** STK Query returns a result code, not an amount, so the "amount matches" check from the original plan is done as follows:
  - The push amount is always the server-computed order total.
  - The callback's amount must equal it before its receipt number is stored. A mismatch is flagged `AMOUNT_MISMATCH` and the receipt is dropped.
  - The order is settled on STK Query's result code alone.
- **Callbacks are verified inline, not queued.** The callback request records the event and calls STK Query before answering, which keeps the flow testable without a running worker. If the query fails or is still processing, the attempt stays `PENDING`, and the worker (`reconcile-mpesa-payments`, every 20 s) retries with backoff of 15 s up to 2 min.
- **Exactly-once settlement.**
  - The attempt is claimed with a conditional update (`status <> SUCCEEDED`) inside the transaction that marks the order paid.
  - Duplicate callbacks are stopped by the `(provider, dedupeKey)` unique index, keyed on `stk:<CheckoutRequestID>:<ResultCode>`.
  - Tests race three duplicate callbacks against the worker and see exactly one sale, one status change and one email.
- **A failed prompt does not cancel the order.**
  - Cancelled, wrong PIN, insufficient balance or timeout marks only the attempt.
  - The customer can ask for a new prompt (optionally to another number), up to 3 per order, while the stock hold lasts.
  - Expiry never cancels an order while a prompt is still in progress (each prompt is waited for at most 3 minutes).
- **Unexpected money is refunded, never lost.** A confirmed payment for an order that was already paid or was cancelled is recorded as an extra `Payment` (`paidAt` null, so it doesn't count as the payment that settled the order). A full `Refund` is queued automatically for staff.
- **Refunds are bookkeeping for now.**
  - M-Pesa reversals need Safaricom initiator credentials, so staff send the money back outside the platform and record it.
  - Request (`orders:refund`) and completion are separate steps, and the requester cannot complete their own refund.
  - Amounts are checked against the payment, less what is already refunded or held by open refunds, with the payment row locked.
  - Each step is audited.
- **Callback URL secret.**
  - `/api/v1/payments/mpesa/callback/<MPESA_CALLBACK_SECRET>`, compared in constant time; a wrong secret gets 404.
  - The secret is redacted from request logs.
  - An optional IP allowlist (`MPESA_ALLOWED_IPS`) rejects other sources; their callbacks are stored but ignored.
- **Live gate.** `MPESA_ENV=production` refuses to start unless `PAYMENTS_LIVE_APPROVED=true`. Simulated payments are refused in production.
- **Known gaps.**
  - If an STK Push request times out after reaching Safaricom, the CheckoutRequestID is unknown. A payment made on that prompt arrives as an `UNMATCHED` event for manual matching.
  - Automated matching via the Transaction Status API, and automated reversals, need initiator credentials and are deferred.
