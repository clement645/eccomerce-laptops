import Link from 'next/link';
import { Laptop } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Logo({
  name,
  tagline,
  tone = 'dark',
}: {
  name: string;
  tagline?: string | null;
  tone?: 'dark' | 'light';
}) {
  return (
    // Named by its visible text (store name and tagline), plus "home" for screen readers.
    <Link href="/" className="flex shrink-0 items-center gap-2.5">
      <span className="bg-brand-gradient grid size-10 place-items-center rounded-xl text-white shadow-button">
        <Laptop aria-hidden className="size-5" />
      </span>
      <span className="leading-tight">
        <span
          className={cn(
            'block font-display text-[15px] font-extrabold',
            tone === 'light' ? 'text-white' : 'text-ink',
          )}
        >
          {name}
          <span className="sr-only"> (home)</span>
        </span>
        {tagline && (
          <span
            className={cn(
              'text-[11px] font-medium',
              tone === 'light' ? 'block text-white/60' : 'hidden text-ink-subtle sm:block',
            )}
          >
            {tagline}
          </span>
        )}
      </span>
    </Link>
  );
}
