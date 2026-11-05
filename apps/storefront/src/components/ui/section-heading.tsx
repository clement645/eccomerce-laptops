import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';

interface SectionHeadingProps {
  /** Full title; `highlight` (a suffix or substring of it) is rendered with the brand gradient. */
  title: string;
  highlight?: string | null;
  subtitle?: string | null;
  action?: { label: string; href: string } | null;
  tone?: 'dark' | 'light';
  id?: string;
  className?: string;
}

export function HighlightedText({
  text,
  highlight,
  tone = 'dark',
}: {
  text: string;
  highlight?: string | null;
  tone?: 'dark' | 'light';
}) {
  const index = highlight ? text.lastIndexOf(highlight) : -1;
  if (!highlight || index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <span className={tone === 'light' ? 'text-gradient-light' : 'text-gradient'}>
        {highlight}
      </span>
      {text.slice(index + highlight.length)}
    </>
  );
}

export function SectionHeading({
  title,
  highlight,
  subtitle,
  action,
  tone = 'dark',
  id,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn('mb-8 flex items-end justify-between gap-4', className)}>
      <div>
        <h2
          id={id}
          className={cn(
            'text-2xl font-extrabold md:text-3xl',
            tone === 'light' ? 'text-white' : 'text-ink',
          )}
        >
          <HighlightedText text={title} highlight={highlight} tone={tone} />
        </h2>
        {subtitle && (
          <p
            className={cn(
              'mt-1.5 text-sm md:text-base',
              tone === 'light' ? 'text-white/70' : 'text-ink-muted',
            )}
          >
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <Link
          href={action.href}
          className={cn(
            'group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold',
            tone === 'light'
              ? 'text-white hover:text-primary-200'
              : 'text-primary-600 hover:text-primary-700',
          )}
        >
          {action.label}
          <ArrowRight aria-hidden className="size-4 transition group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}
