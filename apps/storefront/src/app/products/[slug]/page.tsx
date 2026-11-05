import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Star } from 'lucide-react';
import type { ProductDetail } from '@repo/shared-types';
import { Breadcrumbs } from '@/components/catalog/breadcrumbs';
import { JsonLd } from '@/components/catalog/json-ld';
import { ProductCard } from '@/components/product/product-card';
import { ProductGallery } from '@/components/product/product-gallery';
import {
  DeliveryAndWarranty,
  ReviewsSection,
  SpecificationsTable,
} from '@/components/product/product-sections';
import { PurchasePanel } from '@/components/product/purchase-panel';
import { SectionHeading } from '@/components/ui/section-heading';
import { WriteReview } from '@/components/product/write-review';
import { getProduct, getRelatedProducts } from '@/lib/catalog';
import { publicEnv } from '@/lib/env';
import { routes } from '@/lib/routes';

export async function generateMetadata({
  params,
}: PageProps<'/products/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: 'Product not found', robots: { index: false } };
  const image = product.images[0];
  return {
    title: product.seo.title,
    description: product.seo.description,
    alternates: { canonical: routes.product(slug) },
    openGraph: {
      title: product.name,
      description: product.seo.description,
      url: routes.product(slug),
      images: image ? [{ url: image.url, alt: image.alt }] : undefined,
    },
  };
}

function productJsonLd(product: ProductDetail) {
  const url = new URL(routes.product(product.slug), publicEnv.NEXT_PUBLIC_SITE_URL).toString();
  const condition =
    product.condition === 'REFURBISHED'
      ? 'https://schema.org/RefurbishedCondition'
      : 'https://schema.org/NewCondition';
  const availability = (stock: string) =>
    stock === 'OUT_OF_STOCK'
      ? 'https://schema.org/OutOfStock'
      : stock === 'LOW_STOCK'
        ? 'https://schema.org/LimitedAvailability'
        : 'https://schema.org/InStock';
  const offers = product.variants.map((variant) => ({
    '@type': 'Offer',
    sku: variant.sku,
    price: (variant.priceMinor / 100).toFixed(2),
    priceCurrency: 'KES',
    availability: availability(variant.stockStatus),
    itemCondition: condition,
    url,
  }));
  const prices = product.variants.map((v) => v.priceMinor / 100);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.variants[0]?.sku,
    description: product.seo.description,
    brand: { '@type': 'Brand', name: product.brand.name },
    category: product.category.name,
    itemCondition: condition,
    url,
    ...(product.images.length ? { image: product.images.map((i) => i.url) } : {}),
    offers:
      offers.length > 1
        ? {
            '@type': 'AggregateOffer',
            priceCurrency: 'KES',
            lowPrice: Math.min(...prices).toFixed(2),
            highPrice: Math.max(...prices).toFixed(2),
            offerCount: offers.length,
            offers,
          }
        : offers[0],
    // Only real, approved reviews are ever reported.
    ...(product.reviews
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.reviews.average,
            reviewCount: product.reviews.count,
          },
        }
      : {}),
  };
}

const SECTIONS = [
  { id: 'description', label: 'Description' },
  { id: 'specifications', label: 'Specifications' },
  { id: 'delivery', label: 'Delivery & warranty' },
  { id: 'reviews', label: 'Reviews' },
];

async function ProductContent({ params, searchParams }: PageProps<'/products/[slug]'>) {
  await connection();
  const { slug } = await params;
  const [product, related] = await Promise.all([getProduct(slug), getRelatedProducts(slug)]);
  if (!product) notFound();
  const variantParam = (await searchParams).variant;
  const initialSku = typeof variantParam === 'string' ? variantParam : undefined;
  const trail = product.breadcrumbs.map((crumb) => ({
    name: crumb.name,
    href: routes.category(crumb.slug),
  }));

  return (
    <>
      <JsonLd data={productJsonLd(product)} />
      <div className="container-page pt-6">
        <Breadcrumbs
          items={[{ name: 'Shop', href: routes.shop }, ...trail, { name: product.name }]}
        />
      </div>

      <section className="container-page grid gap-8 py-6 lg:grid-cols-2 lg:gap-12">
        <ProductGallery
          productId={product.id}
          productName={product.name}
          slug={product.slug}
          categorySlug={product.category.slug}
          images={product.images}
        />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={routes.brand(product.brand.slug)}
              className="text-sm font-semibold uppercase tracking-wider text-primary-600 hover:text-primary-700"
            >
              {product.brand.name}
            </Link>
            {product.condition === 'REFURBISHED' && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                Refurbished
              </span>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-extrabold leading-tight md:text-3xl">{product.name}</h1>
          <a
            href="#reviews"
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary-600"
          >
            {product.reviews ? (
              <>
                <Star aria-hidden className="size-4 fill-amber-400 text-amber-400" />
                {product.reviews.average.toFixed(1)} ({product.reviews.count}{' '}
                {product.reviews.count === 1 ? 'review' : 'reviews'})
              </>
            ) : (
              'No reviews yet'
            )}
          </a>
          {product.shortDescription && (
            <p className="mt-4 leading-7 text-ink-muted">{product.shortDescription}</p>
          )}
          <div className="mt-6 border-t border-line pt-6">
            <PurchasePanel variants={product.variants} initialSku={initialSku} />
          </div>
        </div>
      </section>

      <nav
        aria-label="Product sections"
        className="sticky top-16 z-30 border-y border-line bg-white/95 backdrop-blur lg:top-[121px]"
      >
        <ul className="container-page flex gap-1 overflow-x-auto scrollbar-none">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="block whitespace-nowrap px-4 py-3.5 text-sm font-semibold text-ink-muted hover:text-primary-600"
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="container-page space-y-14 py-12">
        <section id="description" aria-labelledby="description-title" className="scroll-mt-40">
          <h2 id="description-title" className="mb-4 text-2xl font-extrabold">
            Description
          </h2>
          {product.descriptionHtml ? (
            // descriptionHtml is sanitized by the API with a strict allowlist (sanitizeRichText).
            <div
              className="max-w-3xl space-y-4 leading-7 text-ink-muted [&_a]:text-primary-600 [&_a]:underline [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_h3]:font-bold [&_h3]:text-ink [&_li]:ml-5 [&_strong]:text-ink [&_ul]:list-disc"
              dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
            />
          ) : (
            <p className="text-ink-muted">{product.shortDescription}</p>
          )}
        </section>
        <section id="specifications" aria-labelledby="specs-title" className="scroll-mt-40">
          <h2 id="specs-title" className="mb-4 text-2xl font-extrabold">
            Specifications
          </h2>
          <SpecificationsTable specifications={product.specifications} />
        </section>
        <section id="delivery" aria-labelledby="delivery-title" className="scroll-mt-40">
          <h2 id="delivery-title" className="mb-4 text-2xl font-extrabold">
            Delivery &amp; warranty
          </h2>
          <DeliveryAndWarranty product={product} />
        </section>
        <section id="reviews" aria-labelledby="reviews-title" className="scroll-mt-40">
          <h2 id="reviews-title" className="mb-4 text-2xl font-extrabold">
            Customer reviews
          </h2>
          <ReviewsSection reviews={product.reviews} />
          <WriteReview productSlug={product.slug} />
        </section>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-title" className="bg-surface-muted py-14">
          <div className="container-page">
            <SectionHeading id="related-title" title="You May Also Like" highlight="Also Like" />
            <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
              {related.map((item) => (
                <li key={item.id}>
                  <ProductCard product={item} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}

function ProductSkeleton() {
  return (
    <div
      className="container-page grid gap-8 py-10 lg:grid-cols-2"
      aria-busy="true"
      aria-label="Loading product"
    >
      <div className="aspect-square animate-pulse rounded-3xl bg-surface-sunken" />
      <div className="space-y-4">
        <div className="h-4 w-24 animate-pulse rounded bg-line" />
        <div className="h-9 w-3/4 animate-pulse rounded-xl bg-line" />
        <div className="h-10 w-40 animate-pulse rounded-xl bg-line" />
        <div className="h-24 animate-pulse rounded-2xl bg-surface-sunken" />
      </div>
    </div>
  );
}

/**
 * Unknown products render the not-found page inside the stream: the status stays 200 but Next.js
 * adds <meta name="robots" content="noindex">, so search engines drop the URL. A hard 404 status
 * would need a Proxy lookup on every request; see docs/ARCHITECTURE.md (storefront data loading).
 */
export default function ProductPage(props: PageProps<'/products/[slug]'>) {
  return (
    <main id="main" className="flex-1">
      <Suspense fallback={<ProductSkeleton />}>
        <ProductContent {...props} />
      </Suspense>
    </main>
  );
}
