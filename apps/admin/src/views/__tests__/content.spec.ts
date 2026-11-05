import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminBlogPost, AdminReview } from '@repo/shared-types';
import PostEditorView from '../blog/PostEditorView.vue';
import ReviewsView from '../engagement/ReviewsView.vue';
import { json, mountView } from './mount';

afterEach(() => vi.unstubAllGlobals());

const review: AdminReview = {
  id: 'r1',
  product: { id: 'p1', name: 'HP EliteBook', slug: 'hp' },
  author: { name: 'Wanjiru Mwangi', email: 'w@example.com' },
  rating: 4,
  title: 'Solid',
  body: 'Battery lasts all day.',
  status: 'PENDING',
  verifiedPurchase: true,
  moderationNote: null,
  moderatedBy: null,
  moderatedAt: null,
  createdAt: '2026-10-30T09:00:00.000Z',
};

describe('ReviewsView', () => {
  it('publishes a waiting review', async () => {
    const fetchMock = vi.fn((url: URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? json(null, 204)
        : json({ items: [review], page: 1, pageSize: 25, total: 1 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = await mountView(
      ReviewsView,
      '/reviews',
      [{ path: '/reviews', name: 'reviews', component: ReviewsView }],
      ['reviews:moderate'],
    );
    expect(String(fetchMock.mock.calls[0]![0])).toContain('status=PENDING');
    expect(wrapper.text()).toContain('Battery lasts all day.');
    expect(wrapper.text()).toContain('verified purchase');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Publish')!
      .trigger('click');
    await flushPromises();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(String(post[0])).toContain('/admin/reviews/r1/moderate');
    expect(JSON.parse(post[1]!.body as string)).toEqual({ status: 'APPROVED' });
  });
});

describe('PostEditorView', () => {
  it('previews drafts in a sandbox where scripts cannot run', async () => {
    const draft: AdminBlogPost = {
      id: 'b1',
      slug: 'guide',
      title: 'Guide',
      excerpt: null,
      contentHtml: '<p>Hello</p><script>alert(1)</script>',
      coverKey: null,
      coverUrl: null,
      coverAlt: null,
      categoryId: null,
      status: 'DRAFT',
      publishedAt: null,
      readingMinutes: 1,
      seoTitle: null,
      seoDescription: null,
      author: 'Staff',
      updatedAt: '2026-10-30T09:00:00.000Z',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: URL) => json(String(url).includes('/categories') ? [] : draft)),
    );
    const { wrapper } = await mountView(
      PostEditorView,
      '/blog/b1',
      [{ path: '/blog/:id', name: 'post', component: PostEditorView }],
      ['blog:write'],
    );
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Preview')!
      .trigger('click');
    const frame = wrapper.find('iframe');
    expect(frame.attributes('sandbox')).toBe('');
    expect(frame.attributes('srcdoc')).toContain('<p>Hello</p>');
    // Without blog:publish there are no publishing controls.
    expect(wrapper.text()).not.toContain('Publish now');
    expect(wrapper.text()).toContain('An editor with publishing rights');
  });
});
