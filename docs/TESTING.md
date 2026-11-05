# Testing

| Suite                                  | Command                                                  | Needs                                                                                 | What it covers                                                                                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (all workspaces)                  | `pnpm test`                                              | Docker services (`pnpm docker:up`) for the API part                                   | Pricing and coupon maths, Daraja client with a fake `fetch`, sanitizer, image detection, validation (including "forms accept their own output"), configuration rules, Vue and React components |
| API end-to-end                         | `pnpm --filter @repo/api test:e2e` (part of `pnpm test`) | Docker Postgres, Redis and RustFS; uses the `ecommerce_test` database and Redis DB 15 | Auth, catalog, cart and checkout, payments (fake Daraja), admin, content, the authorization matrix, abuse and race tests                                                                       |
| Browser journey, accessibility, mobile | `pnpm test:e2e`                                          | A running stack (below)                                                               | Playwright: full shopper and staff journey, axe on 17 pages, phone layouts                                                                                                                     |
| Load                                   | `pnpm test:load`                                         | A running API with a high `RATE_LIMIT_PER_MINUTE`                                     | Throughput and p95 budgets for the busiest read endpoints                                                                                                                                      |
| Lighthouse                             | `pnpm lighthouse`                                        | Production storefront build plus API; `CHROME_PATH` set                               | Performance, accessibility, best practices and SEO for home, listing, product and blog                                                                                                         |

Running the browser, load and Lighthouse suites is described in [tests/e2e/README.md](../tests/e2e/README.md).

## Results for the Phase 10 release candidate (2026-11-05, local machine: 4 cores, 12 GB)

- **Unit and API:** all pass. The counts are in the Phase 10 report.
- **Authorization matrix:** 121 routes, all protected as declared; 5/5 tests.
- **Abuse suite:** 11/11.
- **Playwright:** 27/27.
  - The journey: staff two-factor sign-in; coupon creation; customer registration and email confirmation (Mailpit); search, cart, five-step checkout with the coupon and simulated M-Pesa; fulfilment to delivered; review, moderation and the review appearing on the product page.
  - axe (WCAG 2.1 A/AA, serious and critical) on 15 storefront pages, the admin sign-in page, the admin dashboard, the admin order page, the product page and checkout.
  - Phone layouts on 7 pages, with no sideways scrolling.
- **Load:** 25 concurrent clients, 10 s per endpoint, warm caches, one client IP.

  | Endpoint         | Requests/s                                                                                     | p50   | p95   | p99    | Errors |
  | ---------------- | ---------------------------------------------------------------------------------------------- | ----- | ----- | ------ | ------ |
  | Homepage         | 517                                                                                            | 45 ms | 76 ms | 110 ms | 0      |
  | Layout           | 1,195                                                                                          | 17 ms | 41 ms | 59 ms  | 0      |
  | Product list     | 1,230                                                                                          | 18 ms | 35 ms | 48 ms  | 0      |
  | Filtered list    | 1,318                                                                                          | 17 ms | 29 ms | 40 ms  | 0      |
  | Product detail   | 1,625                                                                                          | 14 ms | 26 ms | 40 ms  | 0      |
  | Full-text search | 1,252                                                                                          | 16 ms | 41 ms | 56 ms  | 0      |
  | Search suggest   | (route limited to 120/min per IP; the 429s were fast, so capacity beyond that wasn't measured) |       |       |        |        |

- **Lighthouse** (mobile, simulated throttling, other services sharing the CPU):

  | Page    | Performance | Accessibility | Best practices | SEO | LCP   | TBT    |
  | ------- | ----------- | ------------- | -------------- | --- | ----- | ------ |
  | Home    | 69          | 100           | 96             | 100 | 1.3 s | 2.37 s |
  | Listing | 54          | 98            | 96             | 91  | 5.0 s | 1.83 s |
  | Product | 71          | 100           | 96             | 91  | 1.1 s | 1.71 s |
  | Blog    | 57          | 100           | 96             | 100 | 4.8 s | 1.38 s |

  Performance is below the 80 budget; see [KNOWN-ISSUES.md](./KNOWN-ISSUES.md).

## Accessibility fixes made in Phase 10

- **Low-contrast text across the store:** brand names, "was" prices, helper text and "No reviews yet" were 3.1:1. The `ink-subtle` token was darkened to #646b7f (at least 4.7:1 on every page background), and the success, warning and danger colours were darkened too.
- **Badges:** white-on-green "New" and white-on-amber "Refurbished" moved to the 700 shades.
- **Admin menu:** section headings went from 40% to 60% white (7.2:1). The footer newsletter note was raised the same way.
- **"Add to Cart" buttons:** the accessible name now starts with the visible text ("Add to Cart: <product>") so voice control finds them.
- **Logo link:** named by its visible text, plus "(home)".
- **Cart thumbnails:** they repeated the product link without a name; they're now hidden from screen readers and the tab order.
