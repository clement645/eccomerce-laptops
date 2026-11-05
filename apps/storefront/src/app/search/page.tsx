import { Suspense } from 'react';
import { ListingSkeleton } from '@/components/catalog/listing-view';
import { listingMetadata, renderListing } from '@/lib/listing-page';
import type { SearchParams } from '@/lib/listing-query';

async function searchTerm(searchParams: Promise<SearchParams>): Promise<string> {
  const q = (await searchParams).q;
  return (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 100) ?? '';
}

export async function generateMetadata({ searchParams }: PageProps<'/search'>) {
  const term = await searchTerm(searchParams);
  return listingMetadata({
    basePath: '/search',
    searchParams,
    title: term ? `Search results for “${term}”` : 'Search',
    description: 'Search laptops, desktops, gaming gear and accessories.',
    // Search result pages are never indexed.
    noIndex: true,
  });
}

async function SearchResults({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const term = await searchTerm(searchParams);
  return renderListing({
    basePath: '/search',
    searchParams,
    title: term ? `Results for “${term}”` : 'Search our store',
    highlight: term ? `“${term}”` : 'store',
    description: term ? null : 'Type a product, brand or specification in the search box above.',
    breadcrumbs: [{ name: 'Search' }],
  });
}

export default function SearchPage({ searchParams }: PageProps<'/search'>) {
  return (
    <main id="main" className="flex-1">
      <Suspense fallback={<ListingSkeleton />}>
        <SearchResults searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
