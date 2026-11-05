import { ApiError } from '@repo/api-client';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

/**
 * Map an API error onto the form: field-level validation details go to their fields,
 * anything else becomes a form-level message.
 */
export function applyApiError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
): string {
  if (error instanceof ApiError) {
    if (error.code === 'VALIDATION_FAILED' && Array.isArray(error.details)) {
      let mapped = false;
      for (const detail of error.details as { path?: string; message?: string }[]) {
        if (detail.path && fields.includes(detail.path)) {
          setError(detail.path as Path<T>, {
            type: 'server',
            message: detail.message ?? 'Invalid value',
          });
          mapped = true;
        }
      }
      if (mapped) return '';
    }
    if (error.status === 429 && error.code === 'RATE_LIMITED')
      return 'Too many attempts. Please wait a few minutes and try again.';
    return error.message;
  }
  return 'Something went wrong. Check your connection and try again.';
}
