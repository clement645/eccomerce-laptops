import { execFileSync } from 'node:child_process';

/** Integration tests run against the Docker test database (`pnpm docker:up`), never Neon. */
export default function globalSetup(): void {
  try {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      env: { ...process.env, DB_TARGET: 'test' },
      stdio: 'pipe',
    });
  } catch (error) {
    const output = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
    throw new Error(
      `Could not migrate the test database. Is Docker running? Try "pnpm docker:up".\n${output}`,
    );
  }
}
