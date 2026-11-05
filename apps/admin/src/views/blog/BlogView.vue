<script setup lang="ts">
import { reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { Plus } from 'lucide-vue-next';
import type { AdminBlogCategory, AdminBlogPost, Paginated } from '@repo/shared-types';
import AppDialog from '@/components/ui/AppDialog.vue';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import PaginationBar from '@/components/ui/PaginationBar.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { useListQuery } from '@/composables/useListQuery';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { formatDateTime, slugify } from '@/lib/format';

const api = useAdminApi();
const queryClient = useQueryClient();
const { filters, setPage, params } = useListQuery({ status: '', q: '' });
const posts = useQuery({
  queryKey: ['admin-posts', params],
  queryFn: () => api.get<Paginated<AdminBlogPost>>('/blog/posts', params.value),
  placeholderData: keepPreviousData,
});
const categories = useQuery({
  queryKey: ['admin-blog-categories'],
  queryFn: () => api.get<AdminBlogCategory[]>('/blog/categories'),
});

const category = reactive({ id: null as string | null, name: '', slug: '', description: '' });
const open = ref(false);
const error = ref('');
const fields = ref<Record<string, string>>({});
function editCategory(c?: AdminBlogCategory) {
  Object.assign(
    category,
    c
      ? { id: c.id, name: c.name, slug: c.slug, description: c.description ?? '' }
      : { id: null, name: '', slug: '', description: '' },
  );
  error.value = '';
  fields.value = {};
  open.value = true;
}
const saveCategory = useMutation({
  mutationFn: () => {
    const body = {
      name: category.name,
      slug: category.slug || slugify(category.name),
      description: category.description || null,
    };
    return category.id
      ? api.put(`/blog/categories/${category.id}`, body)
      : api.post('/blog/categories', body);
  },
  onSuccess: async () => {
    open.value = false;
    await queryClient.invalidateQueries({ queryKey: ['admin-blog-categories'] });
  },
  onError: (e) => {
    error.value = errorMessage(e);
    fields.value = fieldErrors(e);
  },
});
const deleteCategory = useMutation({
  mutationFn: () => api.del(`/blog/categories/${category.id}`),
  onSuccess: async () => {
    open.value = false;
    await queryClient.invalidateQueries({ queryKey: ['admin-blog-categories'] });
  },
  onError: (e) => (error.value = errorMessage(e)),
});
</script>

<template>
  <div>
    <PageHeader
      title="Blog"
      description="Buying guides and news for the storefront. Scheduled posts go live automatically."
    >
      <RouterLink :to="{ name: 'post-new' }" class="btn btn-primary"
        ><Plus class="size-4" aria-hidden="true" /> New post</RouterLink
      >
    </PageHeader>
    <div class="grid gap-5 xl:grid-cols-[1fr_18rem]">
      <div class="card min-w-0 overflow-hidden">
        <form
          class="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_auto]"
          role="search"
          @submit.prevent
        >
          <input
            v-model.lazy="filters.q"
            type="search"
            class="field-input"
            placeholder="Search titles"
            aria-label="Search titles"
          />
          <select v-model="filters.status" class="field-input" aria-label="Status">
            <option value="">All</option>
            <option value="DRAFT">Drafts</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </form>
        <ErrorNotice
          v-if="posts.isError.value"
          class="m-4"
          :message="errorMessage(posts.error.value)"
        />
        <LoadingState v-else-if="posts.isPending.value" />
        <template v-else-if="posts.data.value">
          <table class="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Publish date</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in posts.data.value.items" :key="p.id">
                <td>
                  <RouterLink
                    :to="{ name: 'post', params: { id: p.id } }"
                    class="font-medium hover:text-brand-blue"
                    >{{ p.title }}</RouterLink
                  >
                  <span class="block text-xs text-ink-muted"
                    >{{ p.author ?? '—' }} · {{ p.readingMinutes ?? 1 }} min read</span
                  >
                </td>
                <td><StatusBadge :status="p.status" /></td>
                <td class="text-sm text-ink-muted">{{ formatDateTime(p.publishedAt) }}</td>
                <td class="text-sm text-ink-muted">{{ formatDateTime(p.updatedAt) }}</td>
              </tr>
              <tr v-if="!posts.data.value.items.length">
                <td colspan="4" class="py-10 text-center text-ink-muted">No posts yet.</td>
              </tr>
            </tbody>
          </table>
          <PaginationBar v-bind="posts.data.value" @change="setPage" />
        </template>
      </div>
      <section class="card h-fit p-5">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold">Topics</h3>
          <button
            type="button"
            class="btn btn-ghost !p-1.5"
            aria-label="New topic"
            @click="editCategory()"
          >
            <Plus class="size-4" aria-hidden="true" />
          </button>
        </div>
        <ul class="mt-2 divide-y divide-slate-100 text-sm">
          <li v-for="c in categories.data.value" :key="c.id">
            <button
              type="button"
              class="flex w-full justify-between py-2 text-left hover:text-brand-blue"
              @click="editCategory(c)"
            >
              {{ c.name }} <span class="text-ink-muted">{{ c.postCount }}</span>
            </button>
          </li>
          <li v-if="!categories.data.value?.length" class="py-2 text-ink-muted">No topics yet.</li>
        </ul>
      </section>
    </div>

    <AppDialog :open="open" :title="category.id ? 'Edit topic' : 'New topic'" @close="open = false">
      <form id="topic-form" class="space-y-3" @submit.prevent="saveCategory.mutate()">
        <ErrorNotice :message="error" />
        <div>
          <label for="t-name" class="field-label">Name</label
          ><input id="t-name" v-model="category.name" class="field-input" required minlength="2" />
        </div>
        <div>
          <label for="t-slug" class="field-label">URL slug</label>
          <input
            id="t-slug"
            v-model="category.slug"
            class="field-input font-mono"
            :placeholder="slugify(category.name)"
            :aria-invalid="!!fields.slug"
          />
          <p v-if="fields.slug" class="mt-1 text-xs text-red-700">{{ fields.slug }}</p>
        </div>
        <div>
          <label for="t-desc" class="field-label">Description</label
          ><input id="t-desc" v-model="category.description" class="field-input" maxlength="300" />
        </div>
      </form>
      <template #footer>
        <button
          v-if="category.id"
          type="button"
          class="btn btn-ghost mr-auto !text-red-700"
          @click="deleteCategory.mutate()"
        >
          Delete
        </button>
        <button type="button" class="btn btn-secondary" @click="open = false">Cancel</button>
        <button
          type="submit"
          form="topic-form"
          class="btn btn-primary"
          :disabled="saveCategory.isPending.value"
        >
          Save
        </button>
      </template>
    </AppDialog>
  </div>
</template>
