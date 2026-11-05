import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';
import { resolveDatabase } from './src/database-url.ts';

// Prisma 7 does not load .env files. Real environment variables take precedence over the file.
if (existsSync('.env')) process.loadEnvFile('.env');

const database = resolveDatabase();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/index.ts',
  },
  datasource: {
    url: database.url,
    ...(database.shadowUrl ? { shadowDatabaseUrl: database.shadowUrl } : {}),
  },
});
