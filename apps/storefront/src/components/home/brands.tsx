import Image from 'next/image';
import Link from 'next/link';
import type { BrandSummary } from '@repo/shared-types';
import { SectionHeading } from '@/components/ui/section-heading';
import { routes } from '@/lib/routes';

/** Uploaded logo when available; otherwise a typographic wordmark (no reproduced trademarks). */
function BrandMark({ brand, className }: { brand: BrandSummary; className?: string }) {
  if (brand.logoUrl) {
    return (
      <span className={`relative block h-8 w-24 ${className ?? ''}`}>
        <Image src={brand.logoUrl} alt={brand.name} fill sizes="96px" className="object-contain" />
      </span>
    );
  }
  return (
    <span className={`font-display text-lg font-extrabold tracking-tight ${className ?? ''}`}>
      {brand.name}
    </span>
  );
}

export function TrustedBrands({ brands }: { brands: BrandSummary[] }) {
  if (brands.length === 0) return null;
  return (
    <section aria-labelledby="trusted-brands-title" className="container-page py-10">
      <div className="flex flex-col gap-6 rounded-3xl border border-line bg-white px-6 py-6 md:flex-row md:items-center md:px-8">
        <div className="shrink-0">
          <h2 id="trusted-brands-title" className="text-lg font-extrabold">
            Trusted Brands
          </h2>
          <p className="text-sm text-ink-muted">Genuine products from leading makers.</p>
        </div>
        <ul className="flex flex-1 flex-wrap items-center justify-around gap-x-8 gap-y-4">
          {brands.slice(0, 8).map((brand) => (
            <li key={brand.slug}>
              <Link
                href={routes.brand(brand.slug)}
                className="text-ink-subtle transition hover:text-primary-600"
              >
                <BrandMark brand={brand} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function TopBrands({ brands }: { brands: BrandSummary[] }) {
  if (brands.length === 0) return null;
  return (
    <section aria-labelledby="top-brands-title" className="bg-surface-muted py-14 md:py-20">
      <div className="container-page">
        <SectionHeading
          id="top-brands-title"
          title="Explore Our Top Brands"
          highlight="Top Brands"
          subtitle="Shop trusted names in computing."
          action={{ label: 'View All Brands', href: routes.brands }}
        />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-5">
          {brands.slice(0, 8).map((brand) => (
            <li key={brand.slug}>
              <Link
                href={routes.brand(brand.slug)}
                className="group flex h-24 flex-col items-center justify-center rounded-2xl border border-line bg-white text-ink shadow-card transition hover:-translate-y-0.5 hover:border-primary-200 hover:shadow-card-hover md:h-28"
              >
                <BrandMark
                  brand={brand}
                  className="text-xl transition group-hover:text-primary-600"
                />
                <span className="mt-1 text-xs text-ink-subtle">
                  {brand.productCount} {brand.productCount === 1 ? 'product' : 'products'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
