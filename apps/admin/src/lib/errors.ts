import { ApiError } from '@repo/api-client';

/** A message a staff member can act on. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "You don't have permission to do that.";
    if (error.status === 429) return 'Too many requests. Wait a moment and try again.';
    if (error.code === 'VALIDATION_FAILED') return 'Some fields need attention.';
    return error.message;
  }
  return 'Something went wrong. Check your connection and try again.';
}

/** Field-level messages from a validation error, keyed by dotted path (e.g. "variants.0.sku"). */
export function fieldErrors(error: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (error instanceof ApiError && Array.isArray(error.details)) {
    for (const detail of error.details as { path?: string; message?: string }[]) {
      if (detail.path && detail.message && !result[detail.path])
        result[detail.path] = detail.message;
    }
  }
  return result;
}
