import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export * from './generated/prisma/client.js';
export { describeDatabaseUrl, resolveDatabase, type DatabaseTarget } from './database-url.js';

export interface CreatePrismaClientOptions {
  connectionString: string;
  /** Maximum pool size. Keep small on Neon: the pooler multiplexes server-side. */
  maxConnections?: number;
  connectionTimeoutMs?: number;
  idleTimeoutMs?: number;
  /** Abort statements that run longer than this (server-side). */
  statementTimeoutMs?: number;
  log?: ('query' | 'info' | 'warn' | 'error')[];
}

/** Create one client per process; each client owns a connection pool. */
export function createPrismaClient(options: CreatePrismaClientOptions): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: withExplicitTlsVerification(options.connectionString),
    max: options.maxConnections ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMs ?? 10_000,
    idleTimeoutMillis: options.idleTimeoutMs ?? 30_000,
    statement_timeout: options.statementTimeoutMs ?? 15_000,
  });
  return new PrismaClient({ adapter, log: options.log ?? ['warn', 'error'] });
}

/**
 * node-postgres already treats sslmode=require as verify-full (certificate and hostname checked) and
 * warns that the meaning will change. Spell out verify-full so the strict behaviour is explicit and stable.
 */
function withExplicitTlsVerification(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    if (url.searchParams.get('sslmode') === 'require')
      url.searchParams.set('sslmode', 'verify-full');
    return url.toString();
  } catch {
    return connectionString;
  }
}
