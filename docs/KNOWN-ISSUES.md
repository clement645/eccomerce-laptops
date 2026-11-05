# Known issues (release candidate, Phase 10)

Things to know before going live, grouped by what they block. Security residual risks are explained in
[SECURITY-REVIEW.md](./SECURITY-REVIEW.md).

## Must do before launch

1. **Production database.**
   - Neon was unreachable from the development machine, so all work since Phase 6 used local Postgres.
   - The Neon password was shared in chat; rotate it.
   - Then apply every migration with `pnpm db:migrate:deploy` (Phase 11).
2. **Real M-Pesa** has only been tested against a fake Daraja and the simulated provider.
   - It needs a run in the Daraja sandbox (credentials, an https callback).
   - Production also needs Safaricom go-live and `PAYMENTS_LIVE_APPROVED=true` with the owner's sign-off.
3. **Policy pages are missing.** Delivery information, Returns & warranty and Privacy policy are linked from the footer but return 404. They need the store's own terms; they shouldn't be invented.
4. **Email deliverability:** SPF, DKIM and DMARC for the sending domain, and a production SMTP provider (Phase 11).

## Should fix soon after launch

5. **Mobile performance** (Lighthouse 54–71, below the 80 budget).
   - The main cost is JavaScript start-up (React hydration: 1.4–2.4 s Total Blocking Time with 4× CPU throttling).
   - The slowest paint on the listing and blog pages is text that appears at 4–5 s, even though the server answers in about 10 ms.
   - Next steps:
     - turn more listing and card markup into server components;
     - load the carousel's animation library only on the homepage;
     - check web-font loading and the SVG placeholder illustrations (real product photos will replace most of them);
     - measure again on production hosting rather than a shared development machine.
6. **Wishlist** isn't built; the heart buttons are disabled.
7. **Customer data rights:** no self-service data export or account deletion yet; staff handle requests manually.
8. **Passwords aren't checked against known breaches.**
9. **Uploaded images aren't re-encoded** after validation.

## Limitations to be aware of

10. **Refunds are bookkeeping only.** Staff send M-Pesa reversals outside the platform and record them.
11. **M-Pesa callbacks for a prompt whose request timed out** arrive "unmatched" and need manual matching.
12. **Newsletter campaigns** are sent with an external tool from the CSV export.
13. **Unknown product, category or brand URLs** return a "not found" page with status 200 and `noindex`, not a 404 status.
14. **Browser coverage:** automated runs use Chromium (desktop and Pixel 7 emulation) only; Safari and Firefox haven't been run.
15. **Load figures** come from one machine and one client IP, with warm caches, over 10-second runs. A longer soak test from several IPs against production-sized data is still needed.
16. **Two rules have no automated test:**
    - "last staff manager can't be removed", because it depends on every staff account in the shared test database;
    - admin accessibility beyond the dashboard, order and sign-in pages.
17. **Coupon per-customer limits** match by account and email address. A guest using a different email isn't linked to their earlier orders.
18. **Port 3000 on the development machine** is used by another project's container, so local runs used the storefront on port 3100.
