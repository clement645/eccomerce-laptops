import { apiEnvSchema, parseEnv, type ApiEnv } from '@repo/configuration';

export const API_ENV = Symbol('API_ENV');

export function loadApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  return parseEnv('api', apiEnvSchema, source);
}
