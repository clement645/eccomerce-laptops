import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { ListingSkeleton } from '@/components/catalog/listing-view';
import { getCategory } from '@/lib/catalog';
import { listingMetadata, renderListing } from '@/lib/listing-page';
import type { SearchParams } from '@/lib/listing-query';
import { routes } from '@/lib/routes';

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<'/category/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) return { title: 'Category not found', robots: { index: false } };
  return listingMetadata({
    basePath: routes.category(slug),
    fixed: { category: slug },
    searchParams,
    title: category.seoTitle ?? `${category.name} in Kenya`,
    description:
      category.seoDescription ??
      category.description ??
      `Shop ${category.name.toLowerCase()} with delivery across Kenya. Genuine products, M-Pesa checkout.`,
  });
}

async function CategoryListing({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await connection();
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) notFound();
  const trail = category.breadcrumbs.map((crumb, index) => ({
    name: crumb.name,
    href: index < category.breadcrumbs.length - 1 ? routes.category(crumb.slug) : undefined,
  }));
  return renderListing({
    basePath: routes.category(slug),
    fixed: { category: slug },
    searchParams,
    title: category.name,
    highlight: category.name.split(' ').pop(),
    description: category.description,
    breadcrumbs: [{ name: 'Shop', href: routes.shop }, ...trail],
  });
}

export default function CategoryPage({ params, searchParams }: PageProps<'/category/[slug]'>) {
  return (
    <main id="main" className="flex-1">
      <Suspense fallback={<ListingSkeleton />}>
        <CategoryListing params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
