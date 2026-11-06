# Browser, accessibility, load and Lighthouse checks

These run against a **running stack**, so start it first.

```bash
pnpm docker:up
pnpm build
pnpm --filter @repo/api storage:init        # once

# API with simulated M-Pesa (PAYMENTS_SIMULATED=true in apps/api/.env; it runs its own background jobs) and production frontends
cd apps/api && node --env-file=.env dist/main.js &
cd apps/storefront && npx next start -p 3000 &
cd apps/admin && npx vite preview --port 5173 &
```

If the storefront runs on another port, set `E2E_STOREFRONT_URL`, and give the API the matching `CORS_ORIGINS`,
`STOREFRONT_URL` and `STOREFRONT_REVALIDATE_URL`.

| Variable             | Default                                                      |
| -------------------- | ------------------------------------------------------------ |
| `E2E_STOREFRONT_URL` | `http://localhost:3000`                                      |
| `E2E_ADMIN_URL`      | `http://localhost:5173`                                      |
| `E2E_API_URL`        | `http://localhost:4000/api/v1`                               |
| `E2E_MAILPIT_URL`    | `http://localhost:8025`                                      |
| `PW_CHROMIUM_PATH`   | Playwright's own browser (`npx playwright install chromium`) |

## Playwright

```bash
pnpm test:e2e
```

- Global setup checks that every service answers, then creates a fresh staff account with `admin:create`. Credentials are kept in the git-ignored `.auth/` folder.
- The journey enrols that account's two-factor and computes codes the way an authenticator app does.
- Emails (account confirmation, order updates) are read from Mailpit.
- Reports go to `playwright-report/`, and failure traces to `test-results/`.
- Each run leaves one staff account and one customer in the database. That's fine for local and CI databases; never point the suite at production.

## Load

```bash
# The API must allow far more than the normal per-IP limit for a single-machine run
RATE_LIMIT_PER_MINUTE=10000000 node --env-file=.env dist/main.js   # in apps/api
pnpm test:load -- --seconds 20 --concurrency 40
```

Each endpoint has a p95 budget. Any error, or a p95 over budget, fails the run. Endpoints with their own route
limit (search suggestions) report 429s as "throttled".

## Lighthouse

```bash
CHROME_PATH=/path/to/chrome pnpm lighthouse
```

Run it against the production storefront build. HTML reports go to `reports/`. The run fails if a category is below
its budget (performance 80, accessibility 95, best practices 90, SEO 90).
