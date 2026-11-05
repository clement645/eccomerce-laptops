import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { PostCard } from '@/components/blog/post-card';
import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { Pagination } from '@/components/catalog/pagination';
import { HighlightedText } from '@/components/ui/section-heading';
import { cn } from '@/lib/cn';
import { getBlogCategories, getBlogPosts } from '@/lib/content';
import { routes } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'News & Tips',
  description: 'Buying guides, setup tips and tech news from our team in Nairobi.',
  alternates: { canonical: routes.blog },
};

const pageHref = (page: number, category?: string) => {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `${routes.blog}?${query}` : routes.blog;
};

async function PostList({ searchParams }: PageProps<'/blog'>) {
  await connection();
  const query = await searchParams;
  const category =
    typeof query.category === 'string' && /^[a-z0-9-]{1,120}$/.test(query.category)
      ? query.category
      : undefined;
  const page = Math.max(1, Math.min(500, Number(query.page) || 1));
  const [posts, categories] = await Promise.all([
    getBlogPosts(page, category),
    getBlogCategories(),
  ]);
  const used = categories.filter((c) => c.postCount > 0);
  const totalPages = Math.ceil(posts.total / posts.pageSize);

  return (
    <>
      {used.length > 0 && (
        <nav aria-label="Topics" className="mb-8 flex flex-wrap gap-2">
          {[{ slug: undefined, name: 'All' }, ...used].map((c) => {
            const active = c.slug === category;
            return (
              <Link
                key={c.slug ?? 'all'}
                href={pageHref(1, c.slug)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-full border px-4 py-1.5 text-sm font-semibold transition',
                  active
                    ? 'border-primary-600 bg-primary-600 text-white'
                    : 'border-line bg-white text-ink hover:border-primary-300',
                )}
              >
                {c.name}
              </Link>
            );
          })}
        </nav>
      )}
      {posts.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-6 py-16 text-center text-ink-muted">
          No articles here yet. Check back soon.
        </p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.items.map((post, i) => (
            <li key={post.slug}>
              <PostCard post={post} index={i} priority={i < 3} />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-10">
        <Pagination page={page} totalPages={totalPages} hrefFor={(p) => pageHref(p, category)} />
      </div>
    </>
  );
}

export default function BlogPage(props: PageProps<'/blog'>) {
  return (
    <main id="main" className="flex-1">
      <section className="border-b border-line bg-surface-muted">
        <div className="container-page py-10">
          <Breadcrumbs items={[{ name: 'News & Tips' }]} />
          <h1 className="mt-3 text-3xl font-extrabold md:text-4xl">
            <HighlightedText text="Latest News & Tips" highlight="News & Tips" />
          </h1>
          <p className="mt-2 max-w-2xl text-ink-muted">Buying guides and advice from our team.</p>
        </div>
      </section>
      <div className="container-page py-10">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface-sunken" />}>
          <PostList {...props} />
        </Suspense>
      </div>
    </main>
  );
}
