export interface SearchMatch {
  productId: string;
  /** Higher is more relevant. Only comparable within one result set. */
  rank: number;
}

/**
 * Product search abstraction. The PostgreSQL implementation can be swapped for a dedicated
 * engine (Meilisearch, Typesense, OpenSearch) without changing the catalog service.
 */
export interface ProductSearchEngine {
  /** Published products matching a free-text query, best first. */
  match(query: string, limit: number): Promise<SearchMatch[]>;
}

export const PRODUCT_SEARCH_ENGINE = Symbol('PRODUCT_SEARCH_ENGINE');

/**
 * Lower-cased word tokens (letters and digits only), safe to embed in a tsquery as "token:*".
 * Accents are stripped so "café" also matches "cafe".
 */
export function searchTokens(query: string, max = 8): string[] {
  return query
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter(Boolean)
    .slice(0, max);
}
