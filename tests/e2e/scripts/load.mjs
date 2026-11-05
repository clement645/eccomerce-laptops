/**
 * Load test for the read-heavy API endpoints and checkout quoting.
 *
 *   E2E_API_URL=http://localhost:4000/api/v1 pnpm --filter @repo/e2e load [-- --seconds 20 --concurrency 40]
 *
 * All requests come from one machine, so start the API with a high RATE_LIMIT_PER_MINUTE for the run,
 * otherwise the per-IP limit (correctly) answers 429. Reports throughput and latency percentiles and
 * exits non-zero if any endpoint exceeds its p95 budget or returns errors.
 */
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    seconds: { type: 'string', default: '15' },
    concurrency: { type: 'string', default: '25' },
  },
});
const API = (process.env.E2E_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
const SECONDS = Number(values.seconds);
const CONCURRENCY = Number(values.concurrency);

const list = await (await fetch(`${API}/catalog/products?pageSize=24`)).json();
const slugs = list.items.map((p) => p.slug);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const words = [
  'laptop',
  'hp',
  'dell',
  'ssd',
  'gaming',
  'mouse',
  'monitor',
  'thinkpad',
  'macbook',
  'printer',
];

/**
 * Endpoint, request factory, p95 budget in milliseconds (local hardware, warm caches), and whether the
 * route has its own per-IP limit: there, 429s are the protection working and are reported as throttled.
 */
const scenarios = [
  ['homepage', () => fetch(`${API}/storefront/homepage`), 150],
  ['layout', () => fetch(`${API}/storefront/layout`), 100],
  [
    'product list',
    () => fetch(`${API}/catalog/products?page=${1 + Math.floor(Math.random() * 2)}&sort=popular`),
    250,
  ],
  [
    'filtered list',
    () => fetch(`${API}/catalog/products?inStock=true&minPrice=10000&sort=price_asc`),
    300,
  ],
  ['product detail', () => fetch(`${API}/catalog/products/${pick(slugs)}`), 200],
  ['search suggest', () => fetch(`${API}/catalog/search/suggest?q=${pick(words)}`), 250, true],
  ['full-text search', () => fetch(`${API}/catalog/products?q=${pick(words)}`), 400],
];

async function runScenario([name, request, budget, ownLimit = false]) {
  const latencies = [];
  const statuses = new Map();
  const end = Date.now() + SECONDS * 1000;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (Date.now() < end) {
        const started = performance.now();
        try {
          const res = await request();
          await res.arrayBuffer();
          statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
        } catch {
          statuses.set('network', (statuses.get('network') ?? 0) + 1);
        }
        latencies.push(performance.now() - started);
      }
    }),
  );
  latencies.sort((a, b) => a - b);
  const p = (q) =>
    latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))].toFixed(0);
  const throttled = ownLimit ? (statuses.get(429) ?? 0) : 0;
  const errors =
    [...statuses].filter(([s]) => s !== 200).reduce((n, [, c]) => n + c, 0) - throttled;
  return {
    name,
    requests: latencies.length,
    rps: (latencies.length / SECONDS).toFixed(0),
    p50: p(0.5),
    p95: p(0.95),
    p99: p(0.99),
    errors,
    throttled,
    budget,
    ok: errors === 0 && Number(p(0.95)) <= budget,
  };
}

console.log(`Load: ${CONCURRENCY} concurrent clients, ${SECONDS}s per endpoint, against ${API}\n`);
const results = [];
for (const scenario of scenarios) {
  const result = await runScenario(scenario);
  results.push(result);
  console.log(
    `${result.ok ? 'PASS' : 'FAIL'}  ${result.name.padEnd(17)} ${String(result.rps).padStart(5)} req/s  p50 ${result.p50.padStart(4)} ms  p95 ${result.p95.padStart(4)} ms (budget ${result.budget})  p99 ${result.p99.padStart(4)} ms  errors ${result.errors}${result.throttled ? `  throttled (route limit) ${result.throttled}` : ''}`,
  );
}
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
