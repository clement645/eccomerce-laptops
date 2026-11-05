const kes = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0,
});
const kesExact = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Minor units (cents) to "Ksh 12,500". */
export function formatKes(minor: number | null | undefined, exact = false): string {
  if (minor === null || minor === undefined) return '—';
  return (exact ? kesExact : kes).format(minor / 100);
}

/** Shillings typed by staff to minor units. Returns null for empty or invalid input. */
export function toMinor(shillings: string | number | null | undefined): number | null {
  if (shillings === null || shillings === undefined || shillings === '') return null;
  const value = Number(String(shillings).replace(/,/g, ''));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}

export function toShillings(minor: number | null | undefined): string {
  return minor === null || minor === undefined ? '' : String(minor / 100);
}

const dateTime = new Intl.DateTimeFormat('en-KE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Nairobi',
});
const date = new Intl.DateTimeFormat('en-KE', { dateStyle: 'medium', timeZone: 'Africa/Nairobi' });

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? dateTime.format(new Date(iso)) : '—';
export const formatDate = (iso: string | null | undefined) =>
  iso ? date.format(new Date(iso)) : '—';

/** "PARTIALLY_REFUNDED" → "Partially refunded" */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  const text = value.replace(/[_:]/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Lowercase, hyphenated URL slug from a name. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}
