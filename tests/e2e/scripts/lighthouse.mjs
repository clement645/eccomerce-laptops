/**
 * Lighthouse audit of key storefront pages (mobile, simulated throttling).
 *
 *   E2E_STOREFRONT_URL=http://localhost:3000 CHROME_PATH=/path/to/chrome pnpm --filter @repo/e2e lighthouse
 *
 * Run against a production build (`next build && next start`), never the dev server. Writes HTML
 * reports to tests/e2e/reports/ and fails if a category is below its budget.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const BASE = (process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const API = (process.env.E2E_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
const BUDGET = { performance: 0.8, accessibility: 0.95, 'best-practices': 0.9, seo: 0.9 };

const products = await (await fetch(`${API}/catalog/products?pageSize=1`)).json();
const pages = [
  ['home', '/'],
  ['listing', '/shop'],
  ['product', `/products/${products.items[0].slug}`],
  ['blog', '/blog'],
];

mkdirSync(new URL('../reports/', import.meta.url), { recursive: true });
const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox'] });
let failed = false;
try {
  for (const [name, path] of pages) {
    // A warm-up visit so the measurement reflects cached pages, as real visitors get them.
    await fetch(`${BASE}${path}`);
    const result = await lighthouse(`${BASE}${path}`, {
      port: chrome.port,
      output: 'html',
      logLevel: 'error',
    });
    writeFileSync(new URL(`../reports/lighthouse-${name}.html`, import.meta.url), result.report);
    const scores = Object.fromEntries(
      Object.entries(result.lhr.categories).map(([id, c]) => [
        id,
        Math.round((c.score ?? 0) * 100),
      ]),
    );
    const low = Object.entries(BUDGET).filter(([id, min]) => scores[id] < min * 100);
    failed ||= low.length > 0;
    const audits = result.lhr.audits;
    console.log(
      `${low.length ? 'FAIL' : 'PASS'}  ${name.padEnd(8)} perf ${scores.performance}  a11y ${scores.accessibility}  best ${scores['best-practices']}  seo ${scores.seo}` +
        `  · LCP ${audits['largest-contentful-paint'].displayValue}  CLS ${audits['cumulative-layout-shift'].displayValue}  TBT ${audits['total-blocking-time'].displayValue}`,
    );
  }
} finally {
  await chrome.kill();
}
process.exitCode = failed ? 1 : 0;
