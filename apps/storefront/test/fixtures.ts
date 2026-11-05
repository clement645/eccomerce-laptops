import type { BannerContent, ProductCard } from '@repo/shared-types';

export function productFixture(overrides: Partial<ProductCard> = {}): ProductCard {
  return {
    id: 'p1',
    slug: 'hp-elitebook-840-g10',
    name: 'HP EliteBook 840 G10',
    defaultVariantId: '01900000-0000-7000-8000-000000000001',
    brand: { slug: 'hp', name: 'HP' },
    category: { slug: 'laptops', name: 'Laptops' },
    condition: 'NEW',
    priceMinor: 18_999_900,
    compareAtPriceMinor: null,
    hasPriceRange: false,
    discountPercent: 0,
    stockStatus: 'IN_STOCK',
    rating: null,
    image: null,
    isNew: false,
    ...overrides,
  };
}

export function bannerFixture(overrides: Partial<BannerContent> = {}): BannerContent {
  return {
    id: 'b1',
    eyebrow: 'Laptops & Electronics',
    title: 'Your Perfect Tech Partner',
    titleHighlight: 'Tech Partner',
    subtitle: 'Discover powerful laptops.',
    highlights: ['Top Brands', 'Genuine Products'],
    annotation: 'Better performance',
    cta: { label: 'Shop Now', href: '/shop' },
    secondaryCta: { label: 'Explore Deals', href: '/deals' },
    image: null,
    theme: 'dark',
    ...overrides,
  };
}
