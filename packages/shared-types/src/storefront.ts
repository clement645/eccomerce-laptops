import type { ProductCondition, StockStatus } from './catalog.js';
import type { MinorUnits } from './money.js';
import type { PublicStoreSettings } from './api.js';

/** Product summary used by cards and listings. Prices are for the default variant. */
export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  /** Variant added by quick "Add to Cart" from a card. */
  defaultVariantId: string;
  brand: { slug: string; name: string };
  category: { slug: string; name: string };
  condition: ProductCondition;
  priceMinor: MinorUnits;
  compareAtPriceMinor: MinorUnits | null;
  /** True when variants have different prices (show "From"). */
  hasPriceRange: boolean;
  discountPercent: number;
  stockStatus: StockStatus;
  /** Null when there are no approved reviews. Never fabricated. */
  rating: { average: number; count: number } | null;
  image: { url: string; alt: string } | null;
  /** Published within the last 14 days. */
  isNew: boolean;
}

export interface CategorySummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  productCount: number;
}

export interface BrandSummary {
  slug: string;
  name: string;
  logoUrl: string | null;
  productCount: number;
}

export interface BannerContent {
  id: string;
  eyebrow: string | null;
  title: string;
  titleHighlight: string | null;
  subtitle: string | null;
  highlights: string[];
  annotation: string | null;
  cta: { label: string; href: string } | null;
  secondaryCta: { label: string; href: string } | null;
  image: { url: string; mobileUrl: string | null; alt: string } | null;
  theme: string;
}

export interface HomepageSection {
  key: string;
  title: string;
  subtitle: string | null;
  /** Where "View all" should lead, when there is a matching listing. */
  href: string | null;
  products: ProductCard[];
}

export interface TestimonialContent {
  id: string;
  authorName: string;
  authorTitle: string | null;
  location: string | null;
  quote: string;
  avatarUrl: string | null;
}

export interface BlogPostCard {
  slug: string;
  title: string;
  excerpt: string | null;
  coverUrl: string | null;
  coverAlt: string | null;
  category: { slug: string; name: string } | null;
  publishedAt: string;
  readingMinutes: number | null;
}

/** Real figures computed from the database. */
export interface StoreStats {
  productCount: number;
  brandCount: number;
  countiesServed: number;
  /** Null until there are approved reviews. */
  reviews: { count: number; average: number } | null;
}

/** Data every storefront page needs (header, footer, announcement bar). */
export interface StorefrontLayout {
  settings: PublicStoreSettings;
  categories: CategorySummary[];
  brands: BrandSummary[];
}

export interface StorefrontHomepage {
  heroBanners: BannerContent[];
  promoBanners: BannerContent[];
  categories: CategorySummary[];
  sections: HomepageSection[];
  brands: BrandSummary[];
  testimonials: TestimonialContent[];
  posts: BlogPostCard[];
  stats: StoreStats;
}
