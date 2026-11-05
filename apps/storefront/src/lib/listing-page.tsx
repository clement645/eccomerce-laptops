import type { Metadata } from 'next';
import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import type { Crumb } from '@/components/catalog/breadcrumbs';
import { ListingView } from '@/components/catalog/listing-view';
import { getProductList } from './catalog';
import {
  hasRefinements,
  parseListingQuery,
  type FixedScope,
  type SearchParams,
} from './listing-query';

interface RenderListingOptions {
  basePath: string;
  fixed?: FixedScope;
  searchParams: Promise<SearchParams>;
  title: string;
  highlight?: string | null;
  description?: string | null;
  breadcrumbs: Crumb[];
}

/** Shared server rendering for every product listing page. */
export async function renderListing(options: RenderListingOptions) {
  await connection();
  const fixed = options.fixed ?? {};
  const query = parseListingQuery(await options.searchParams, fixed);
  const data = await getProductList(query);
  if (!data) notFound();
  return (
    <ListingView
      basePath={options.basePath}
      fixed={fixed}
      query={query}
      data={data}
      title={options.title}
      highlight={options.highlight}
      description={options.description}
      breadcrumbs={options.breadcrumbs}
    />
  );
}

/**
 * Listing metadata. Filtered and sorted variants point their canonical URL at the clean listing
 * and are kept out of the index, so search engines see one URL per category, brand or page number.
 */
export async function listingMetadata(options: {
  basePath: string;
  fixed?: FixedScope;
  searchParams: Promise<SearchParams>;
  title: string;
  description: string;
  noIndex?: boolean;
}): Promise<Metadata> {
  const fixed = options.fixed ?? {};
  const query = parseListingQuery(await options.searchParams, fixed);
  const refined = hasRefinements(query, fixed) || query.sort !== (query.q ? 'relevance' : 'newest');
  const canonical = query.page > 1 ? `${options.basePath}?page=${query.page}` : options.basePath;
  const title = query.page > 1 ? `${options.title} (page ${query.page})` : options.title;
  return {
    title,
    description: options.description,
    alternates: { canonical },
    robots: options.noIndex || refined ? { index: false, follow: true } : undefined,
    openGraph: { title, description: options.description, url: canonical },
  };
}
