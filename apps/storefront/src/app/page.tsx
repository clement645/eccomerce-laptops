import { Suspense } from 'react';
import { Homepage } from '@/components/home/homepage';
import { HomeSkeleton } from '@/components/home/home-skeleton';
import { publicEnv } from '@/lib/env';

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'OnlineStore',
  name: 'Laptops & Electronics',
  url: publicEnv.NEXT_PUBLIC_SITE_URL,
  areaServed: 'KE',
  currenciesAccepted: 'KES',
};

export default function HomePage() {
  return (
    <main id="main" className="flex-1">
      <h1 className="sr-only">Laptops, desktops, gaming PCs and accessories in Kenya</h1>
      <script
        type="application/ld+json"
        // JSON-LD must be inline. Escaping "<" prevents breaking out of the script tag.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationJsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <Suspense fallback={<HomeSkeleton />}>
        <Homepage />
      </Suspense>
    </main>
  );
}
