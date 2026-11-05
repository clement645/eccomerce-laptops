'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export const SORT_LABELS: Record<string, string> = {
  relevance: 'Best match',
  newest: 'Newest',
  popular: 'Most popular',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  rating: 'Top rated',
};

/** Sort control. Each option maps to a server-built URL, so it also works as a no-JS form. */
export function SortSelect({
  value,
  options,
}: {
  value: string;
  options: { value: string; href: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm text-ink-muted">
      <span className="hidden sm:inline">Sort by</span>
      <select
        value={value}
        aria-label="Sort products"
        aria-busy={pending}
        onChange={(event) => {
          const target = options.find((o) => o.value === event.target.value);
          if (target) startTransition(() => router.push(target.href, { scroll: false }));
        }}
        className="rounded-full border border-line bg-white py-2 pl-4 pr-9 text-sm font-medium text-ink focus:border-primary-400 focus:outline-none focus:ring-4 focus:ring-primary-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {SORT_LABELS[option.value] ?? option.value}
          </option>
        ))}
      </select>
    </label>
  );
}
