# ADR 0007: Content, reviews, coupons and outbound email

- Status: accepted
- Date: 2026-10-30

## Decisions

**Reviews are earned and moderated.**

- A customer can review a product only after an order containing it is delivered and paid.
- Each customer has one review per product; editing it sends it back to moderation.
- Product ratings are derived from approved reviews only, so the store never shows a rating it can't back up. This follows the rule "never fabricate ratings or reviews".

**Coupons are priced on the server, twice.**

- The quote applies a code for display.
- Placing the order re-checks it inside the order transaction, with the coupon row locked (`SELECT … FOR UPDATE`).
- Two shoppers racing for the last use of a code get one success and one `422 COUPON_INVALID`, which the end-to-end tests check.
- Discounts are whole shillings off the goods subtotal. They are split across lines so per-line VAT stays correct and the totals add up exactly.
- Cancelling an order deletes its redemption and decrements the count.

**Newsletter consent is explicit.**

- Double opt-in: the confirmation token is stored hashed and expires after 7 days.
- Link actions run as a POST from the page, not on GET, so email scanners that pre-open links can't confirm or unsubscribe anyone.
- Unsubscribe tokens are `HMAC(JWT_ACCESS_SECRET, subscriber id)`: stable for every email and never stored. Rotating that secret invalidates old unsubscribe links, and the link page explains what to do.

**Outbound email goes through the worker.**

- With `MAIL_DELIVERY=queue`, `MailService.send` enqueues on BullMQ and returns. The worker sends over SMTP with 6 attempts and exponential backoff, so a slow mail server never delays checkout.
- The producer connection fails fast. If Redis is down the message is sent directly instead, rather than lost or sent twice.
- Tests use `direct`.

**Contact messages can't be used to send spam.**

- Messages are stored and forwarded only to the store's own inbox, with Reply-To set to the sender.
- There is no automatic reply to the address typed in the form.
- The endpoint is rate-limited (3 per 10 minutes per IP), and a honeypot field files bots as spam.

**Blog HTML is sanitized on save; the admin preview is sandboxed.**

- The API stores only allowlisted HTML.
- The admin preview renders unsaved drafts in `<iframe sandbox>` (no scripts), so a draft can't run code in another staff member's browser.

## Consequences

- Newsletter sending itself (campaigns) is out of scope. Staff export confirmed subscribers, with their unsubscribe links, to a sending tool.
- Coupon usage per customer is matched by account and by email address. A guest using a different email can't be linked to their earlier orders.
