import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { ArrowLeft, Clock } from 'lucide-react';
import type { BlogPostDetail } from '@repo/shared-types';
import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { JsonLd } from '@/components/catalog/json-ld';
import { getBlogPost } from '@/lib/content';
import { publicEnv } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { routes } from '@/lib/routes';

export async function generateMetadata({ params }: PageProps<'/blog/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) return { title: 'Article not found', robots: { index: false } };
  return {
    title: post.seo.title,
    description: post.seo.description ?? undefined,
    alternates: { canonical: routes.post(slug) },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.seo.description ?? undefined,
      url: routes.post(slug),
      publishedTime: post.publishedAt,
      images: post.coverUrl ? [{ url: post.coverUrl, alt: post.coverAlt ?? '' }] : undefined,
    },
  };
}

function articleJsonLd(post: BlogPostDetail) {
  const url = new URL(routes.post(post.slug), publicEnv.NEXT_PUBLIC_SITE_URL).toString();
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.seo.description ?? undefined,
    datePublished: post.publishedAt,
    url,
    mainEntityOfPage: url,
    image: post.coverUrl ?? undefined,
    author: post.author ? { '@type': 'Person', name: post.author } : undefined,
  };
}

async function Article({ params }: PageProps<'/blog/[slug]'>) {
  await connection();
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) notFound();
  return (
    <article>
      <JsonLd data={articleJsonLd(post)} />
      <header className="border-b border-line bg-surface-muted">
        <div className="container-page max-w-3xl py-10">
          <Breadcrumbs items={[{ name: 'News & Tips', href: routes.blog }, { name: post.title }]} />
          {post.category && (
            <Link
              href={`${routes.blog}?category=${post.category.slug}`}
              className="mt-4 inline-block text-sm font-semibold text-primary-600 hover:underline"
            >
              {post.category.name}
            </Link>
          )}
          <h1 className="mt-2 text-3xl font-extrabold leading-tight md:text-4xl">{post.title}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            {post.author && <span>By {post.author}</span>}
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
            <span className="inline-flex items-center gap-1">
              <Clock aria-hidden className="size-3.5" />
              {post.readingMinutes} min read
            </span>
          </p>
        </div>
      </header>
      <div className="container-page max-w-3xl py-10">
        {post.coverUrl && (
          <div className="relative mb-8 aspect-[16/9] overflow-hidden rounded-2xl bg-surface-sunken">
            <Image
              src={post.coverUrl}
              alt={post.coverAlt ?? ''}
              fill
              priority
              sizes="(min-width: 768px) 768px, 100vw"
              className="object-cover"
            />
          </div>
        )}
        {/* contentHtml is sanitized by the API with a strict allowlist (sanitizeRichText). */}
        <div
          className="space-y-5 text-[1.05rem] leading-8 text-ink-muted [&_a]:font-semibold [&_a]:text-primary-600 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-primary-200 [&_blockquote]:pl-4 [&_blockquote]:italic [&_h2]:pt-4 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-ink [&_h3]:pt-2 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-ink [&_li]:ml-6 [&_ol]:list-decimal [&_strong]:text-ink [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:border-line [&_td]:p-2 [&_th]:border [&_th]:border-line [&_th]:bg-surface-sunken [&_th]:p-2 [&_ul]:list-disc"
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />
        <Link
          href={routes.blog}
          className="mt-12 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" /> All articles
        </Link>
      </div>
    </article>
  );
}

export default function BlogPostPage(props: PageProps<'/blog/[slug]'>) {
  return (
    <main id="main" className="flex-1">
      <Suspense
        fallback={
          <div className="container-page max-w-3xl py-16">
            <div className="h-96 animate-pulse rounded-2xl bg-surface-sunken" />
          </div>
        }
      >
        <Article {...props} />
      </Suspense>
    </main>
  );
}
