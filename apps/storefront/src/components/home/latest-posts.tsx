import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
import type { BlogPostCard } from '@repo/shared-types';
import { DeviceArt } from '@/components/illustrations/device-art';
import { SectionHeading } from '@/components/ui/section-heading';
import { formatDate } from '@/lib/format';
import { routes } from '@/lib/routes';

const COVER_GRADIENTS = [
  'from-primary-600 to-brand-blue',
  'from-navy-900 to-primary-700',
  'from-fuchsia-600 to-primary-600',
];

/** Pick an illustration that matches the article topic until cover images are uploaded. */
function coverKind(post: BlogPostCard): string {
  const text = `${post.slug} ${post.title}`.toLowerCase();
  if (text.includes('gaming')) return 'gaming';
  if (text.includes('ssd') || text.includes('hdd') || text.includes('storage'))
    return 'storage-devices';
  if (text.includes('desktop')) return 'desktops';
  return 'laptops';
}

export function LatestPosts({ posts }: { posts: BlogPostCard[] }) {
  if (posts.length === 0) return null;
  return (
    <section aria-labelledby="posts-title" className="bg-surface-muted py-14 md:py-20">
      <div className="container-page">
        <SectionHeading
          id="posts-title"
          title="Latest News & Tips"
          highlight="News & Tips"
          subtitle="Buying guides and advice from our team."
          action={{ label: 'View All', href: routes.blog }}
        />
        <ul className="grid gap-5 md:grid-cols-3">
          {posts.map((post, index) => (
            <li key={post.slug}>
              <article className="group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-card transition hover:-translate-y-1 hover:shadow-card-hover">
                <div
                  className={`relative aspect-[16/9] bg-gradient-to-br ${COVER_GRADIENTS[index % COVER_GRADIENTS.length]}`}
                >
                  {post.coverUrl ? (
                    <Image
                      src={post.coverUrl}
                      alt={post.coverAlt ?? ''}
                      fill
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className="object-cover"
                    />
                  ) : (
                    <DeviceArt
                      kind={coverKind(post)}
                      idPrefix={`post-${post.slug}`}
                      accent={index}
                      className="absolute inset-0 m-auto h-4/5 w-4/5"
                    />
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <p className="flex items-center gap-3 text-xs text-ink-subtle">
                    {post.category && (
                      <span className="font-semibold text-primary-600">{post.category.name}</span>
                    )}
                    <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
                    {post.readingMinutes && (
                      <span className="inline-flex items-center gap-1">
                        <Clock aria-hidden className="size-3" />
                        {post.readingMinutes} min read
                      </span>
                    )}
                  </p>
                  <h3 className="mt-2 font-display text-lg font-bold leading-snug text-ink">
                    <Link href={routes.post(post.slug)} className="after:absolute after:inset-0">
                      {post.title}
                    </Link>
                  </h3>
                  {post.excerpt && (
                    <p className="mt-2 line-clamp-2 text-sm text-ink-muted">{post.excerpt}</p>
                  )}
                  <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-primary-600">
                    Read More
                    <ArrowRight
                      aria-hidden
                      className="size-4 transition group-hover:translate-x-0.5"
                    />
                  </span>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
