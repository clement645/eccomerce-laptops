import { formatKes } from '@repo/shared-types';

export { formatKes };

const dateFormatter = new Intl.DateTimeFormat('en-KE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

/** Stable small hash for picking decorative variations (never for security). */
export function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}
