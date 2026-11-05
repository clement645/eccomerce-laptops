import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STAFF_FILE, urls } from './env';

const apiDir = fileURLToPath(new URL('../../../apps/api', import.meta.url));

async function up(name: string, url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
  } catch (error) {
    throw new Error(
      `${name} is not reachable at ${url} (${(error as Error).message}). Start the stack first: see tests/e2e/README.md.`,
    );
  }
}

/** Checks the stack is running and creates a fresh staff account for this run. */
export default async function globalSetup(): Promise<void> {
  await up('API', `${urls.api}/health`);
  await up('Storefront', urls.storefront);
  await up('Admin', urls.admin);
  await up('Mailpit', `${urls.mailpit}/api/v1/messages`);

  const email = `e2e-staff-${Date.now()}@example.com`;
  const password = `E2e-${randomBytes(12).toString('base64url')}`;
  execFileSync(
    'node',
    [
      '--env-file-if-exists=.env',
      'dist/cli/create-admin.js',
      '--email',
      email,
      '--name',
      'E2E Staff',
    ],
    {
      cwd: apiDir,
      env: { ...process.env, ADMIN_PASSWORD: password },
      stdio: 'pipe',
    },
  );
  mkdirSync(new URL('.', STAFF_FILE), { recursive: true });
  writeFileSync(STAFF_FILE, JSON.stringify({ email, password }));
}
