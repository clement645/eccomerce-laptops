import Link from 'next/link';
import { X } from 'lucide-react';

export interface ActiveFilter {
  label: string;
  removeHref: string;
}

export function ActiveFilters({
  filters,
  clearHref,
}: {
  filters: ActiveFilter[];
  clearHref: string;
}) {
  if (filters.length === 0) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {filters.map((filter) => (
        <Link
          key={filter.label}
          href={filter.removeHref}
          scroll={false}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 transition hover:bg-primary-100"
        >
          {filter.label}
          <X aria-hidden className="size-3.5" />
          <span className="sr-only">(remove filter)</span>
        </Link>
      ))}
      <Link
        href={clearHref}
        scroll={false}
        className="text-xs font-semibold text-ink-muted underline-offset-2 hover:text-primary-600 hover:underline"
      >
        Clear all
      </Link>
    </div>
  );
}
