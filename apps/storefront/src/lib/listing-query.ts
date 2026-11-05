import { PRODUCT_PAGE_SIZE, productListQuerySchema, type ProductListQuery } from '@repo/validation';

export type ListingQuery = ProductListQuery;
export type SearchParams = Record<string, string | string[] | undefined>;

/** Parameters each listing page pins (e.g. the category on /category/[slug]). */
export interface FixedScope {
  category?: string;
  brand?: string;
  onSale?: boolean;
}

/**
 * Parse URL search params with the same schema the API uses. Invalid parameters are dropped one by
 * one rather than failing the page, so a hand-edited URL still shows results.
 */
export function parseListingQuery(
  searchParams: SearchParams,
  fixed: FixedScope = {},
): ListingQuery {
  const input: Record<string, unknown> = { ...searchParams };
  if (fixed.category) input.category = fixed.category;
  if (fixed.brand) input.brand = fixed.brand;
  if (fixed.onSale) input.onSale = 'true';

  let result = productListQuerySchema.safeParse(input);
  for (let attempt = 0; !result.success && attempt < 12; attempt++) {
    const badKey = result.error.issues[0]?.path[0];
    if (typeof badKey !== 'string' || !(badKey in input)) break;
    delete input[badKey];
    result = productListQuerySchema.safeParse(input);
  }
  return result.success ? result.data : productListQuerySchema.parse({});
}

/** Keys a user can change from the UI (fixed scope keys are never written to URLs). */
const URL_KEYS = [
  'q',
  'category',
  'brand',
  'condition',
  'spec',
  'minPrice',
  'maxPrice',
  'inStock',
  'onSale',
  'featured',
  'sort',
  'pageSize',
  'page',
] as const;
type UrlKey = (typeof URL_KEYS)[number];

export type ListingOverrides = Partial<
  Record<UrlKey, string | string[] | number | boolean | undefined | null>
>;

/** Build a listing URL from the current query plus overrides, omitting defaults and fixed scope. */
export function listingHref(
  basePath: string,
  query: ListingQuery,
  fixed: FixedScope,
  overrides: ListingOverrides = {},
): string {
  const current: Record<UrlKey, unknown> = {
    q: query.q,
    category: fixed.category ? undefined : query.category,
    brand: fixed.brand ? query.brand.filter((b) => b !== fixed.brand) : query.brand,
    condition: query.condition,
    spec: query.spec,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    inStock: query.inStock || undefined,
    onSale: fixed.onSale ? undefined : query.onSale || undefined,
    featured: query.featured || undefined,
    sort: query.sort === (query.q ? 'relevance' : 'newest') ? undefined : query.sort,
    pageSize: query.pageSize !== PRODUCT_PAGE_SIZE ? query.pageSize : undefined,
    page: query.page > 1 ? query.page : undefined,
  };
  // Any filter change returns to page 1 unless the page itself is being set.
  if (!('page' in overrides)) current.page = undefined;
  const merged = { ...current, ...overrides };

  const params = new URLSearchParams();
  for (const key of URL_KEYS) {
    const value = merged[key];
    if (value === undefined || value === null || value === false || value === '') continue;
    if (key === 'page' && Number(value) <= 1) continue;
    for (const item of Array.isArray(value) ? value : [value])
      params.append(key, String(item === true ? 'true' : item));
  }
  const search = params.toString();
  return search ? `${basePath}?${search}` : basePath;
}

/** True when anything beyond the page's own scope and pagination is applied. */
export function hasRefinements(query: ListingQuery, fixed: FixedScope): boolean {
  return Boolean(
    (query.category && !fixed.category) ||
    query.brand.some((b) => b !== fixed.brand) ||
    query.condition.length ||
    query.spec.length ||
    query.minPrice !== undefined ||
    query.maxPrice !== undefined ||
    query.inStock ||
    (query.onSale && !fixed.onSale) ||
    query.featured,
  );
}
