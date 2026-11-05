import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { HighlightedText } from '@/components/ui/section-heading';
import { getBrands } from '@/lib/catalog';
import { routes } from '@/lib/routes';

export const metadata: Metadata = {
  title: 'Shop by Brand',
  description:
    'HP, Dell, Lenovo, Apple, ASUS, Acer, MSI, Samsung and more. Genuine products with warranty.',
  alternates: { canonical: routes.brands },
};

async function BrandGrid() {
  await connection();
  const brands = (await getBrands()).filter((brand) => brand.productCount > 0);
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {brands.map((brand) => (
        <li key={brand.slug}>
          <Link
            href={routes.brand(brand.slug)}
            className="group flex h-32 flex-col items-center justify-center rounded-2xl border border-line bg-white shadow-card transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-card-hover"
          >
            {brand.logoUrl ? (
              <span className="relative block h-10 w-28">
                <Image
                  src={brand.logoUrl}
                  alt={brand.name}
                  fill
                  sizes="112px"
                  className="object-contain"
                />
              </span>
            ) : (
              <span className="font-display text-2xl font-extrabold tracking-tight text-ink transition group-hover:text-primary-600">
                {brand.name}
              </span>
            )}
            <span className="mt-1 text-xs text-ink-subtle">
              {brand.productCount} {brand.productCount === 1 ? 'product' : 'products'}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function BrandsPage() {
  return (
    <main id="main" className="flex-1">
      <section className="border-b border-line bg-surface-muted">
        <div className="container-page py-10">
          <Breadcrumbs items={[{ name: 'Brands' }]} />
          <h1 className="mt-3 text-3xl font-extrabold md:text-4xl">
            <HighlightedText text="Shop by Brand" highlight="Brand" />
          </h1>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Genuine products from the names you trust.
          </p>
        </div>
      </section>
      <div className="container-page py-10">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-sunken" />}>
          <BrandGrid />
        </Suspense>
      </div>
    </main>
  );
}
