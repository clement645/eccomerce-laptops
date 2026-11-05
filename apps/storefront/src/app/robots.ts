import type { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  const base = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/search', '/cart', '/checkout', '/account', '/wishlist', '/api/'],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
