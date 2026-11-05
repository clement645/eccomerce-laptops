import { Suspense } from 'react';
import { ListingSkeleton } from '@/components/catalog/listing-view';
import { listingMetadata, renderListing } from '@/lib/listing-page';

const TITLE = 'Shop All Products';
const DESCRIPTION =
  'Browse laptops, desktops, gaming gear, monitors and accessories. Genuine products with delivery across Kenya.';

export function generateMetadata({ searchParams }: PageProps<'/shop'>) {
  return listingMetadata({
    basePath: '/shop',
    searchParams,
    title: TITLE,
    description: DESCRIPTION,
  });
}

export default function ShopPage({ searchParams }: PageProps<'/shop'>) {
  return (
    <main id="main" className="flex-1">
      <Suspense fallback={<ListingSkeleton />}>
        {renderListing({
          basePath: '/shop',
          searchParams,
          title: TITLE,
          highlight: 'Products',
          description: DESCRIPTION,
          breadcrumbs: [{ name: 'Shop' }],
        })}
      </Suspense>
    </main>
  );
}
