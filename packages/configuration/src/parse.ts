import { z } from 'zod';

export class EnvValidationError extends Error {
  constructor(
    readonly app: string,
    readonly issues: string[],
  ) {
    super(`Invalid environment for ${app}:\n  - ${issues.join('\n  - ')}`);
    this.name = 'EnvValidationError';
  }
}

/**
 * Parse environment variables and fail fast with a readable message.
 * Issue messages never include the received values, so secrets do not leak into logs.
 */
export function parseEnv<TSchema extends z.ZodType>(
  app: string,
  schema: TSchema,
  source: Record<string, string | undefined>,
): z.infer<TSchema> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      app,
      result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return result.data;
}

/** Comma-separated list of absolute http(s) origins. */
export const originListSchema = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(
    z
      .array(
        z
          .url({ protocol: /^https?$/ })
          .refine((url) => new URL(url).origin === url.replace(/\/$/, ''), {
            message: 'Each origin must be scheme://host[:port] with no path',
          }),
      )
      .min(1),
  )
  .transform((origins) => origins.map((origin) => origin.replace(/\/$/, '')));

export const nodeEnvSchema = z.enum(['development', 'test', 'production']).default('development');
