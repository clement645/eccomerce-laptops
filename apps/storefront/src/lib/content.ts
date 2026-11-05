import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { ApiError } from '@repo/api-client';
import type {
  BlogCategoryItem,
  BlogPostDetail,
  BlogPostSummary,
  Paginated,
} from '@repo/shared-types';
import { serverApi } from './api';
import { BLOG_TAG, postTag } from './cache-tags';

async function orNull<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function getBlogPosts(
  page: number,
  category?: string,
): Promise<Paginated<BlogPostSummary>> {
  'use cache';
  cacheLife('minutes');
  cacheTag(BLOG_TAG);
  const params = new URLSearchParams({ page: String(page), pageSize: '9' });
  if (category) params.set('category', category);
  return serverApi().request<Paginated<BlogPostSummary>>(`/blog/posts?${params.toString()}`);
}

export async function getBlogPost(slug: string): Promise<BlogPostDetail | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag(BLOG_TAG, postTag(slug));
  return orNull(() =>
    serverApi().request<BlogPostDetail>(`/blog/posts/${encodeURIComponent(slug)}`),
  );
}

export async function getBlogCategories(): Promise<BlogCategoryItem[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag(BLOG_TAG);
  return serverApi().request<BlogCategoryItem[]>('/blog/categories');
}
