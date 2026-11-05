import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import type { StorefrontHomepage, StorefrontLayout } from '@repo/shared-types';
import { serverApi } from './api';

import { HOMEPAGE_TAG, LAYOUT_TAG } from './cache-tags';

/** Tags for on-demand revalidation via POST /api/revalidate. */
export const CACHE_TAGS = { layout: LAYOUT_TAG, homepage: HOMEPAGE_TAG } as const;

/** Header, footer and announcement data. Cached for minutes and refreshed by tag. */
export async function getLayoutData(): Promise<StorefrontLayout> {
  'use cache';
  cacheLife('minutes');
  cacheTag(CACHE_TAGS.layout);
  return serverApi().request<StorefrontLayout>('/storefront/layout');
}

export async function getHomepageData(): Promise<StorefrontHomepage> {
  'use cache';
  cacheLife('minutes');
  cacheTag(CACHE_TAGS.homepage);
  return serverApi().request<StorefrontHomepage>('/storefront/homepage');
}
