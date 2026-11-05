<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ArrowLeft, ExternalLink } from 'lucide-vue-next';
import type {
  AdminBlogCategory,
  AdminBlogPost,
  BlogPostStatusValue,
  MediaUpload,
} from '@repo/shared-types';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import ImageUploader from '@/components/ui/ImageUploader.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { env } from '@/lib/env';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { formatDateTime, slugify } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const api = useAdminApi();
const auth = useAuthStore();
const queryClient = useQueryClient();
const id = computed(() => (route.name === 'post' ? String(route.params.id) : null));
const post = useQuery({
  queryKey: computed(() => ['admin-post', id.value]),
  queryFn: () => api.get<AdminBlogPost>(`/blog/posts/${id.value}`),
  enabled: computed(() => id.value !== null),
});
const categories = useQuery({
  queryKey: ['admin-blog-categories'],
  queryFn: () => api.get<AdminBlogCategory[]>('/blog/categories'),
});

const form = reactive({
  title: '',
  slug: '',
  excerpt: '',
  contentHtml: '',
  coverKey: null as string | null,
  coverUrl: null as string | null,
  coverAlt: '',
  categoryId: '',
  seoTitle: '',
  seoDescription: '',
});
const slugTouched = ref(false);
watch(
  () => form.title,
  (t) => {
    if (!slugTouched.value && !id.value) form.slug = slugify(t);
  },
);
function load(p: AdminBlogPost) {
  Object.assign(form, {
    title: p.title,
    slug: p.slug,
    excerpt: p.excerpt ?? '',
    contentHtml: p.contentHtml,
    coverKey: p.coverKey,
    coverUrl: p.coverUrl,
    coverAlt: p.coverAlt ?? '',
    categoryId: p.categoryId ?? '',
    seoTitle: p.seoTitle ?? '',
    seoDescription: p.seoDescription ?? '',
  });
  slugTouched.value = true;
}
watch(
  () => post.data.value,
  (p) => p && load(p),
  { immediate: true },
);

const tab = ref<'write' | 'preview'>('write');
/** Preview in a sandboxed frame: no scripts run, whatever the draft contains. */
const previewDoc = computed(
  () =>
    `<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px/1.7 system-ui,sans-serif;color:#334155;max-width:42rem;margin:1.5rem auto;padding:0 1rem}h2,h3{color:#0f172a}a{color:#5b3df5}img{max-width:100%}</style></head><body>${form.contentHtml}</body></html>`,
);

const error = ref('');
const notice = ref('');
const fields = ref<Record<string, string>>({});
const fail = (e: unknown) => {
  notice.value = '';
  error.value = errorMessage(e);
  fields.value = fieldErrors(e);
};
const save = useMutation({
  mutationFn: () => {
    const body = {
      title: form.title,
      slug: form.slug,
      excerpt: form.excerpt || null,
      contentHtml: form.contentHtml,
      coverKey: form.coverKey,
      coverAlt: form.coverAlt || null,
      categoryId: form.categoryId || null,
      seoTitle: form.seoTitle || null,
      seoDescription: form.seoDescription || null,
    };
    return id.value
      ? api.put<AdminBlogPost>(`/blog/posts/${id.value}`, body)
      : api.post<AdminBlogPost>('/blog/posts', body);
  },
  onSuccess: async (p) => {
    error.value = '';
    fields.value = {};
    notice.value = 'Saved. Unsupported formatting (scripts, styles) was removed.';
    queryClient.setQueryData(['admin-post', p.id], p);
    void queryClient.invalidateQueries({ queryKey: ['admin-posts'] });
    if (!id.value) await router.replace({ name: 'post', params: { id: p.id } });
    else load(p);
  },
  onError: fail,
});

const publishAt = ref('');
const setStatus = useMutation({
  mutationFn: (status: BlogPostStatusValue) =>
    api.post<AdminBlogPost>(`/blog/posts/${id.value}/status`, {
      status,
      ...(status === 'SCHEDULED'
        ? { publishAt: publishAt.value ? new Date(publishAt.value).toISOString() : undefined }
        : {}),
    }),
  onSuccess: (p) => {
    queryClient.setQueryData(['admin-post', p.id], p);
    void queryClient.invalidateQueries({ queryKey: ['admin-posts'] });
    error.value = '';
    notice.value =
      p.status === 'SCHEDULED'
        ? `Scheduled for ${formatDateTime(p.publishedAt)}.`
        : `Status: ${p.status.toLowerCase()}.`;
  },
  onError: fail,
});
function setCover(m: MediaUpload) {
  form.coverKey = m.storageKey;
  form.coverUrl = m.url;
}
const liveUrl = computed(() =>
  env.VITE_STOREFRONT_URL && post.data.value?.status === 'PUBLISHED'
    ? `${env.VITE_STOREFRONT_URL.replace(/\/$/, '')}/blog/${post.data.value.slug}`
    : null,
);
</script>

<template>
  <div>
    <RouterLink
      :to="{ name: 'blog' }"
      class="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
    >
      <ArrowLeft class="size-4" aria-hidden="true" /> All posts
    </RouterLink>
    <LoadingState v-if="id && post.isPending.value" />
    <form v-else class="space-y-5" novalidate @submit.prevent="save.mutate()">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <h2 class="text-xl font-bold tracking-tight">
            {{ id ? form.title || 'Post' : 'New post' }}
          </h2>
          <StatusBadge v-if="post.data.value" :status="post.data.value.status" />
          <a
            v-if="liveUrl"
            :href="liveUrl"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1 text-sm text-brand-blue hover:underline"
          >
            View <ExternalLink class="size-3.5" aria-hidden="true" />
          </a>
        </div>
        <button type="submit" class="btn btn-primary" :disabled="save.isPending.value">
          {{ save.isPending.value ? 'Saving…' : id ? 'Save changes' : 'Save draft' }}
        </button>
      </div>
      <ErrorNotice :message="error" />
      <p
        v-if="notice && !error"
        role="status"
        class="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
      >
        {{ notice }}
      </p>

      <div class="grid gap-5 xl:grid-cols-[1fr_20rem]">
        <section class="card min-w-0 space-y-4 p-5">
          <div>
            <label for="p-title" class="field-label">Title</label>
            <input
              id="p-title"
              v-model="form.title"
              class="field-input text-base font-semibold"
              required
              :aria-invalid="!!fields.title"
            />
          </div>
          <div>
            <label for="p-slug" class="field-label">URL slug</label>
            <input
              id="p-slug"
              v-model="form.slug"
              class="field-input font-mono"
              required
              :aria-invalid="!!fields.slug"
              @input="slugTouched = true"
            />
            <p v-if="fields.slug" class="mt-1 text-xs text-red-700">{{ fields.slug }}</p>
          </div>
          <div>
            <div class="mb-1.5 flex items-center justify-between">
              <span id="content-label" class="field-label !mb-0">Content</span>
              <div
                class="inline-flex rounded-full border border-slate-200 p-0.5 text-xs"
                role="tablist"
                aria-labelledby="content-label"
              >
                <button
                  type="button"
                  role="tab"
                  :aria-selected="tab === 'write'"
                  :class="['rounded-full px-3 py-1', tab === 'write' && 'bg-navy-950 text-white']"
                  @click="tab = 'write'"
                >
                  Write
                </button>
                <button
                  type="button"
                  role="tab"
                  :aria-selected="tab === 'preview'"
                  :class="['rounded-full px-3 py-1', tab === 'preview' && 'bg-navy-950 text-white']"
                  @click="tab = 'preview'"
                >
                  Preview
                </button>
              </div>
            </div>
            <textarea
              v-show="tab === 'write'"
              v-model="form.contentHtml"
              aria-labelledby="content-label"
              rows="22"
              class="field-input font-mono text-xs"
              :aria-invalid="!!fields.contentHtml"
              placeholder="<h2>Heading</h2>&#10;<p>Paragraph…</p>"
            />
            <iframe
              v-if="tab === 'preview'"
              sandbox=""
              :srcdoc="previewDoc"
              title="Preview"
              class="h-[32rem] w-full rounded-xl border border-slate-200 bg-white"
            />
            <p class="mt-1 text-xs text-ink-muted">
              HTML: headings (h2, h3), paragraphs, lists, bold, italics, links, quotes and tables.
              Anything else is removed on save.
            </p>
          </div>
          <div>
            <label for="p-excerpt" class="field-label">Excerpt (optional)</label>
            <textarea
              id="p-excerpt"
              v-model="form.excerpt"
              rows="2"
              maxlength="300"
              class="field-input"
              placeholder="Written from the first lines if left empty"
            />
          </div>
        </section>

        <aside class="min-w-0 space-y-5">
          <section
            v-if="id && auth.can('blog:publish') && post.data.value"
            class="card space-y-3 p-5"
          >
            <h3 class="font-semibold">Publishing</h3>
            <p class="text-sm text-ink-muted">
              <template v-if="post.data.value.status === 'SCHEDULED'"
                >Goes live {{ formatDateTime(post.data.value.publishedAt) }}.</template
              >
              <template v-else-if="post.data.value.status === 'PUBLISHED'"
                >Live since {{ formatDateTime(post.data.value.publishedAt) }}.</template
              >
              <template v-else>Not visible in the store.</template>
            </p>
            <div class="flex flex-wrap gap-2">
              <button
                v-if="post.data.value.status !== 'PUBLISHED'"
                type="button"
                class="btn btn-primary !py-1.5"
                @click="setStatus.mutate('PUBLISHED')"
              >
                Publish now
              </button>
              <button
                v-if="['PUBLISHED', 'SCHEDULED'].includes(post.data.value.status)"
                type="button"
                class="btn btn-secondary !py-1.5"
                @click="setStatus.mutate('DRAFT')"
              >
                Unpublish
              </button>
              <button
                v-if="post.data.value.status !== 'ARCHIVED'"
                type="button"
                class="btn btn-ghost !py-1.5"
                @click="setStatus.mutate('ARCHIVED')"
              >
                Archive
              </button>
            </div>
            <div class="border-t border-slate-100 pt-3">
              <label for="publish-at" class="field-label">Schedule for</label>
              <div class="flex gap-2">
                <input
                  id="publish-at"
                  v-model="publishAt"
                  type="datetime-local"
                  class="field-input"
                />
                <button
                  type="button"
                  class="btn btn-secondary !py-1.5"
                  :disabled="!publishAt"
                  @click="setStatus.mutate('SCHEDULED')"
                >
                  Schedule
                </button>
              </div>
            </div>
          </section>
          <p v-else-if="id && !auth.can('blog:publish')" class="card p-4 text-sm text-ink-muted">
            An editor with publishing rights will publish this post.
          </p>

          <section class="card space-y-3 p-5">
            <h3 class="font-semibold">Cover image</h3>
            <img
              v-if="form.coverUrl"
              :src="form.coverUrl"
              :alt="form.coverAlt"
              class="aspect-video w-full rounded-lg bg-slate-50 object-cover"
            />
            <ImageUploader folder="blog" label="Upload cover image" @uploaded="setCover" />
            <div v-if="form.coverKey">
              <label for="p-alt" class="field-label">Image description</label>
              <input
                id="p-alt"
                v-model="form.coverAlt"
                class="field-input"
                maxlength="200"
                :aria-invalid="!!fields.coverAlt"
              />
              <p v-if="fields.coverAlt" class="mt-1 text-xs text-red-700">{{ fields.coverAlt }}</p>
              <button
                type="button"
                class="mt-2 text-xs font-semibold text-red-700"
                @click="
                  form.coverKey = null;
                  form.coverUrl = null;
                "
              >
                Remove image
              </button>
            </div>
          </section>
          <section class="card space-y-3 p-5">
            <div>
              <label for="p-topic" class="field-label">Topic</label>
              <select id="p-topic" v-model="form.categoryId" class="field-input">
                <option value="">None</option>
                <option v-for="c in categories.data.value" :key="c.id" :value="c.id">
                  {{ c.name }}
                </option>
              </select>
            </div>
            <div>
              <label for="p-seo-title" class="field-label"
                >Search title ({{ form.seoTitle.length }}/70)</label
              >
              <input
                id="p-seo-title"
                v-model="form.seoTitle"
                class="field-input"
                maxlength="70"
                :placeholder="form.title"
              />
            </div>
            <div>
              <label for="p-seo-desc" class="field-label"
                >Search description ({{ form.seoDescription.length }}/170)</label
              >
              <textarea
                id="p-seo-desc"
                v-model="form.seoDescription"
                rows="3"
                maxlength="170"
                class="field-input"
              />
            </div>
          </section>
        </aside>
      </div>
    </form>
  </div>
</template>
