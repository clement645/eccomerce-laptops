import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
import type { BlogPostSummary } from '@repo/shared-types';
import { DeviceArt } from '@/components/illustrations/device-art';
import { formatDate } from '@/lib/format';
import { routes } from '@/lib/routes';

const GRADIENTS = [
  'from-primary-600 to-brand-blue',
  'from-navy-900 to-primary-700',
  'from-fuchsia-600 to-primary-600',
];

export function PostCard({
  post,
  index,
  priority = false,
}: {
  post: BlogPostSummary;
  index: number;
  priority?: boolean;
}) {
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-card transition hover:-translate-y-1 hover:shadow-card-hover">
      <div
        className={`relative aspect-[16/9] bg-gradient-to-br ${GRADIENTS[index % GRADIENTS.length]}`}
      >
        {post.coverUrl ? (
          <Image
            src={post.coverUrl}
            alt={post.coverAlt ?? ''}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <DeviceArt
            kind="laptops"
            idPrefix={`post-${post.slug}`}
            accent={index}
            className="absolute inset-0 m-auto h-4/5 w-4/5"
          />
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
          {post.category && (
            <span className="font-semibold text-primary-600">{post.category.name}</span>
          )}
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
          <span className="inline-flex items-center gap-1">
            <Clock aria-hidden className="size-3" />
            {post.readingMinutes} min read
          </span>
        </p>
        <h2 className="mt-2 font-display text-lg font-bold leading-snug text-ink">
          <Link href={routes.post(post.slug)} className="after:absolute after:inset-0">
            {post.title}
          </Link>
        </h2>
        {post.excerpt && <p className="mt-2 line-clamp-3 text-sm text-ink-muted">{post.excerpt}</p>}
        <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-primary-600">
          Read more
          <ArrowRight aria-hidden className="size-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </article>
  );
}
