import { Suspense } from 'react';
import { ListingSkeleton } from '@/components/catalog/listing-view';
import { listingMetadata, renderListing } from '@/lib/listing-page';

const TITLE = 'Deals & Special Offers';
const DESCRIPTION = 'Discounted laptops, gaming PCs and accessories. Prices shown include VAT.';
const FIXED = { onSale: true };

export function generateMetadata({ searchParams }: PageProps<'/deals'>) {
  return listingMetadata({
    basePath: '/deals',
    fixed: FIXED,
    searchParams,
    title: TITLE,
    description: DESCRIPTION,
  });
}

export default function DealsPage({ searchParams }: PageProps<'/deals'>) {
  return (
    <main id="main" className="flex-1">
      <Suspense fallback={<ListingSkeleton />}>
        {renderListing({
          basePath: '/deals',
          fixed: FIXED,
          searchParams,
          title: TITLE,
          highlight: 'Special Offers',
          description: DESCRIPTION,
          breadcrumbs: [{ name: 'Deals' }],
        })}
      </Suspense>
    </main>
  );
}
