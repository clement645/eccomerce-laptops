import type { ProductCondition, StockStatus } from './catalog.js';
import type { MinorUnits } from './money.js';
import type { BrandSummary, CategorySummary, ProductCard } from './storefront.js';

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

/** Counts reflect the current scope (search term, category or brand page), not the other active filters. */
export interface ProductFacets {
  categories: FacetOption[];
  brands: FacetOption[];
  conditions: FacetOption[];
  specs: { key: string; options: FacetOption[] }[];
  price: { minMinor: MinorUnits; maxMinor: MinorUnits } | null;
  inStockCount: number;
  onSaleCount: number;
}

export interface ProductListResponse {
  items: ProductCard[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets: ProductFacets;
}

export interface ProductVariantDetail {
  id: string;
  sku: string;
  name: string;
  priceMinor: MinorUnits;
  compareAtPriceMinor: MinorUnits | null;
  discountPercent: number;
  attributes: Record<string, string>;
  stockStatus: StockStatus;
  /** Maximum quantity a customer may add (stock-limited, capped at 10). 0 when out of stock. */
  maxQuantity: number;
  isDefault: boolean;
}

export interface ProductImageDetail {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
  variantId: string | null;
}

export interface ReviewDetail {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  /** First name and last initial only. */
  authorName: string;
  verifiedPurchase: boolean;
  createdAt: string;
}

export interface ProductReviewSummary {
  average: number;
  count: number;
  /** Count per star rating, index 0 = 1 star. */
  distribution: [number, number, number, number, number];
  items: ReviewDetail[];
}

export interface DeliverySummary {
  fromPriceMinor: MinorUnits;
  fastestDays: number;
  slowestDays: number;
  freeAboveMinor: MinorUnits | null;
  countiesServed: number;
}

export interface ProductDetail {
  id: string;
  slug: string;
  name: string;
  brand: { slug: string; name: string; logoUrl: string | null };
  category: { slug: string; name: string };
  /** Root first, ending with the product's own category. */
  breadcrumbs: { slug: string; name: string }[];
  condition: ProductCondition;
  shortDescription: string | null;
  /** Sanitized on the server; safe to render as HTML. */
  descriptionHtml: string | null;
  warranty: { months: number; text: string | null };
  images: ProductImageDetail[];
  variants: ProductVariantDetail[];
  specifications: { group: string; items: { key: string; value: string }[] }[];
  /** Null until there are approved reviews. */
  reviews: ProductReviewSummary | null;
  delivery: DeliverySummary | null;
  seo: { title: string; description: string };
  publishedAt: string | null;
  updatedAt: string;
}

export interface CategoryDetail extends CategorySummary {
  seoTitle: string | null;
  seoDescription: string | null;
  breadcrumbs: { slug: string; name: string }[];
  children: CategorySummary[];
}

export interface BrandDetail extends BrandSummary {
  description: string | null;
  website: string | null;
}

export interface SearchSuggestions {
  products: {
    slug: string;
    name: string;
    brand: string;
    category: string;
    categorySlug: string;
    priceMinor: MinorUnits;
    imageUrl: string | null;
  }[];
  categories: { slug: string; name: string }[];
  brands: { slug: string; name: string }[];
}

export interface SitemapData {
  products: { slug: string; updatedAt: string }[];
  categories: { slug: string; updatedAt: string }[];
  brands: { slug: string; updatedAt: string }[];
  posts: { slug: string; updatedAt: string }[];
}
