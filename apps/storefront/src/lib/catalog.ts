import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { ApiError } from '@repo/api-client';
import type {
  BrandDetail,
  BrandSummary,
  CategoryDetail,
  ProductCard,
  ProductDetail,
  ProductListResponse,
  SitemapData,
} from '@repo/shared-types';
import { serverApi } from './api';
import { CATALOG_TAG, productTag } from './cache-tags';
import type { ListingQuery } from './listing-query';

/** Returns null for 404 so pages can call notFound(); other errors propagate to the error boundary. */
async function orNull<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

function toSearchParams(
  query: ListingQuery,
): Record<string, string | number | boolean | undefined> {
  return {
    q: query.q,
    category: query.category,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    inStock: query.inStock || undefined,
    onSale: query.onSale || undefined,
    featured: query.featured || undefined,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getProductList(query: ListingQuery): Promise<ProductListResponse | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(CATALOG_TAG);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(toSearchParams(query))) {
    if (value !== undefined) params.set(key, String(value));
  }
  for (const brand of query.brand) params.append('brand', brand);
  for (const condition of query.condition) params.append('condition', condition);
  for (const spec of query.spec) params.append('spec', spec);
  return orNull(() =>
    serverApi().request<ProductListResponse>(`/catalog/products?${params.toString()}`),
  );
}

export async function getProduct(slug: string): Promise<ProductDetail | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(CATALOG_TAG, productTag(slug));
  return orNull(() =>
    serverApi().request<ProductDetail>(`/catalog/products/${encodeURIComponent(slug)}`),
  );
}

export async function getRelatedProducts(slug: string): Promise<ProductCard[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag(CATALOG_TAG, productTag(slug));
  return (
    (await orNull(() =>
      serverApi().request<ProductCard[]>(`/catalog/products/${encodeURIComponent(slug)}/related`),
    )) ?? []
  );
}

export async function getCategory(slug: string): Promise<CategoryDetail | null> {
  'use cache';
  cacheLife('hours');
  cacheTag(CATALOG_TAG);
  return orNull(() =>
    serverApi().request<CategoryDetail>(`/catalog/categories/${encodeURIComponent(slug)}`),
  );
}

export async function getBrand(slug: string): Promise<BrandDetail | null> {
  'use cache';
  cacheLife('hours');
  cacheTag(CATALOG_TAG);
  return orNull(() =>
    serverApi().request<BrandDetail>(`/catalog/brands/${encodeURIComponent(slug)}`),
  );
}

export async function getBrands(): Promise<BrandSummary[]> {
  'use cache';
  cacheLife('hours');
  cacheTag(CATALOG_TAG);
  return serverApi().request<BrandSummary[]>('/catalog/brands');
}

export async function getSitemapData(): Promise<SitemapData> {
  'use cache';
  cacheLife('hours');
  cacheTag(CATALOG_TAG);
  return serverApi().request<SitemapData>('/catalog/sitemap');
}
