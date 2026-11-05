import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against an already running stack (API, worker, storefront, admin, Mailpit), started with
 * PAYMENTS_SIMULATED=true. URLs come from the environment so the suite works locally and in CI.
 * See tests/e2e/README.md.
 */
export default defineConfig({
  testDir: './specs',
  // The journey shares one database and one staff account: run tests one at a time.
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  globalSetup: './support/global-setup.ts',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
  ],
});
