import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { getSitemapData } from '@/lib/catalog';
import { publicEnv } from '@/lib/env';
import { routes } from '@/lib/routes';

/** Built at request time (and cached) so builds never depend on the API. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const base = publicEnv.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  const url = (path: string) => `${base}${path}`;
  const staticPages: MetadataRoute.Sitemap = [
    { url: url('/'), changeFrequency: 'daily', priority: 1 },
    { url: url(routes.shop), changeFrequency: 'daily', priority: 0.9 },
    { url: url(routes.deals), changeFrequency: 'daily', priority: 0.8 },
    { url: url(routes.brands), changeFrequency: 'weekly', priority: 0.6 },
    { url: url(routes.blog), changeFrequency: 'weekly', priority: 0.5 },
    { url: url(routes.contact), changeFrequency: 'yearly', priority: 0.3 },
  ];
  try {
    const data = await getSitemapData();
    return [
      ...staticPages,
      ...data.categories.map((c) => ({
        url: url(routes.category(c.slug)),
        lastModified: c.updatedAt,
        changeFrequency: 'daily' as const,
        priority: 0.8,
      })),
      ...data.brands.map((b) => ({
        url: url(routes.brand(b.slug)),
        lastModified: b.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      })),
      ...data.products.map((p) => ({
        url: url(routes.product(p.slug)),
        lastModified: p.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
      ...(data.posts ?? []).map((p) => ({
        url: url(routes.post(p.slug)),
        lastModified: p.updatedAt,
        changeFrequency: 'monthly' as const,
        priority: 0.5,
      })),
    ];
  } catch {
    // If the API is briefly unavailable, still serve the static pages.
    return staticPages;
  }
}
