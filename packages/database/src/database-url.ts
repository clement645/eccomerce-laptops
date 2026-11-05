/**
 * Which database a CLI command (migrate, seed) targets. Selected with DB_TARGET:
 *
 * - remote (default): DIRECT_DATABASE_URL, falling back to DATABASE_URL (Neon).
 *   Neon's direct (non-pooled) endpoint is required for migrations.
 * - local: the Docker database used to author migrations (with its shadow database).
 * - test: the Docker database used by integration tests.
 *
 * Runtime code (the API) always uses DATABASE_URL (Neon's pooled endpoint) and never this module.
 */
export type DatabaseTarget = 'remote' | 'local' | 'test';

const LOCAL_DEFAULTS = {
  local: 'postgresql://ecommerce:ecommerce@localhost:5442/ecommerce',
  shadow: 'postgresql://ecommerce:ecommerce@localhost:5442/ecommerce_shadow',
  test: 'postgresql://ecommerce:ecommerce@localhost:5442/ecommerce_test',
} as const;

export interface ResolvedDatabase {
  target: DatabaseTarget;
  url: string;
  shadowUrl?: string;
}

export function resolveDatabase(
  env: Record<string, string | undefined> = process.env,
): ResolvedDatabase {
  const target = (env.DB_TARGET ?? 'remote') as DatabaseTarget;
  switch (target) {
    case 'local':
      return {
        target,
        url: env.LOCAL_DATABASE_URL ?? LOCAL_DEFAULTS.local,
        shadowUrl: env.LOCAL_SHADOW_DATABASE_URL ?? LOCAL_DEFAULTS.shadow,
      };
    case 'test':
      return { target, url: env.TEST_DATABASE_URL ?? LOCAL_DEFAULTS.test };
    case 'remote': {
      const url = env.DIRECT_DATABASE_URL ?? env.DATABASE_URL;
      if (!url) {
        throw new Error(
          'DIRECT_DATABASE_URL or DATABASE_URL must be set (or use DB_TARGET=local|test)',
        );
      }
      return { target, url };
    }
    default:
      throw new Error(`Unknown DB_TARGET "${String(target)}". Use remote, local or test.`);
  }
}

/** Host and database name only, for logs. Never print credentials. */
export function describeDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
  } catch {
    return '(unparseable url)';
  }
}
