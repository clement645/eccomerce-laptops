/** Central place for storefront URLs. Pages for most of these arrive in Phases 4 to 9. */
export const routes = {
  home: '/',
  shop: '/shop',
  deals: '/deals',
  brands: '/brands',
  blog: '/blog',
  contact: '/contact',
  search: '/search',
  account: '/account',
  wishlist: '/wishlist',
  cart: '/cart',
  category: (slug: string) => `/category/${slug}`,
  brand: (slug: string) => `/brands/${slug}`,
  product: (slug: string) => `/products/${slug}`,
  post: (slug: string) => `/blog/${slug}`,
} as const;
