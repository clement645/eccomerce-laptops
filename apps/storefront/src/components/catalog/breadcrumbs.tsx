import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { publicEnv } from '@/lib/env';
import { JsonLd } from './json-ld';

export interface Crumb {
  name: string;
  href?: string;
}

/** Visible breadcrumb trail plus BreadcrumbList structured data. */
export function Breadcrumbs({ items, tone = 'dark' }: { items: Crumb[]; tone?: 'dark' | 'light' }) {
  const trail: Crumb[] = [{ name: 'Home', href: '/' }, ...items];
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      ...(crumb.href
        ? { item: new URL(crumb.href, publicEnv.NEXT_PUBLIC_SITE_URL).toString() }
        : {}),
    })),
  };
  return (
    <nav aria-label="Breadcrumb">
      <ol
        className={`flex flex-wrap items-center gap-1 text-sm ${tone === 'light' ? 'text-white/70' : 'text-ink-muted'}`}
      >
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1;
          return (
            <li key={`${crumb.name}-${index}`} className="flex items-center gap-1">
              {index > 0 && <ChevronRight aria-hidden className="size-3.5 opacity-60" />}
              {crumb.href && !last ? (
                <Link
                  href={crumb.href}
                  className={tone === 'light' ? 'hover:text-white' : 'hover:text-primary-600'}
                >
                  {crumb.name}
                </Link>
              ) : (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={last ? (tone === 'light' ? 'text-white' : 'font-medium text-ink') : ''}
                >
                  {crumb.name}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <JsonLd data={jsonLd} />
    </nav>
  );
}
