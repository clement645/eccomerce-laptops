import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Page numbers with ellipses: 1 … 4 5 [6] 7 8 … 20 */
export function pageWindow(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result: (number | 'gap')[] = [];
  sorted.forEach((page, i) => {
    if (i > 0 && page - sorted[i - 1]! > 1) result.push('gap');
    result.push(page);
  });
  return result;
}

export function Pagination({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const base =
    'grid h-10 min-w-10 place-items-center rounded-full px-3 text-sm font-semibold transition';
  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1.5">
      {page > 1 ? (
        <Link
          href={hrefFor(page - 1)}
          rel="prev"
          className={cn(base, 'border border-line hover:border-primary-200 hover:text-primary-600')}
        >
          <ChevronLeft aria-hidden className="size-4" />
          <span className="sr-only">Previous page</span>
        </Link>
      ) : null}
      {pageWindow(page, totalPages).map((item, i) =>
        item === 'gap' ? (
          <span key={`gap-${i}`} aria-hidden className="px-1 text-ink-subtle">
            …
          </span>
        ) : (
          <Link
            key={item}
            href={hrefFor(item)}
            aria-label={`Page ${item}`}
            aria-current={item === page ? 'page' : undefined}
            className={cn(
              base,
              item === page
                ? 'bg-primary-600 text-white shadow-button'
                : 'border border-line hover:border-primary-200 hover:text-primary-600',
            )}
          >
            {item}
          </Link>
        ),
      )}
      {page < totalPages ? (
        <Link
          href={hrefFor(page + 1)}
          rel="next"
          className={cn(base, 'border border-line hover:border-primary-200 hover:text-primary-600')}
        >
          <ChevronRight aria-hidden className="size-4" />
          <span className="sr-only">Next page</span>
        </Link>
      ) : null}
    </nav>
  );
}
