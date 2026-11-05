/** Next.js cache tags. Must match StorefrontTags in the API (storefront-revalidation.service.ts). */
export const CATALOG_TAG = 'catalog';
export const HOMEPAGE_TAG = 'storefront-homepage';
export const LAYOUT_TAG = 'storefront-layout';
export const productTag = (slug: string) => `product:${slug}`;
export const BLOG_TAG = 'blog';
export const postTag = (slug: string) => `post:${slug}`;

/** Tags the revalidation hook accepts. Anything else is ignored. */
export function isKnownTag(tag: string): boolean {
  return (
    [CATALOG_TAG, HOMEPAGE_TAG, LAYOUT_TAG, BLOG_TAG].includes(tag) ||
    /^(product|post):[a-z0-9-]{1,120}$/.test(tag)
  );
}
