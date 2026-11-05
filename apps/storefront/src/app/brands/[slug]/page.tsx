import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { ListingSkeleton } from '@/components/catalog/listing-view';
import { getBrand } from '@/lib/catalog';
import { listingMetadata, renderListing } from '@/lib/listing-page';
import type { SearchParams } from '@/lib/listing-query';
import { routes } from '@/lib/routes';

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<'/brands/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrand(slug);
  if (!brand) return { title: 'Brand not found', robots: { index: false } };
  return listingMetadata({
    basePath: routes.brand(slug),
    fixed: { brand: slug },
    searchParams,
    title: `${brand.name} Laptops & Electronics in Kenya`,
    description:
      brand.description ??
      `Shop genuine ${brand.name} products with warranty and delivery across Kenya.`,
  });
}

async function BrandListing({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await connection();
  const { slug } = await params;
  const brand = await getBrand(slug);
  if (!brand) notFound();
  return renderListing({
    basePath: routes.brand(slug),
    fixed: { brand: slug },
    searchParams,
    title: `${brand.name} Products`,
    highlight: 'Products',
    description: brand.description ?? `Genuine ${brand.name} products with warranty.`,
    breadcrumbs: [{ name: 'Brands', href: routes.brands }, { name: brand.name }],
  });
}

export default function BrandPage({ params, searchParams }: PageProps<'/brands/[slug]'>) {
  return (
    <main id="main" className="flex-1">
      <Suspense fallback={<ListingSkeleton />}>
        <BrandListing params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
