<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { Plus } from 'lucide-vue-next';
import type { AdminCategory, MediaUpload } from '@repo/shared-types';
import AppDialog from '@/components/ui/AppDialog.vue';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import ImageUploader from '@/components/ui/ImageUploader.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { slugify } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';

const api = useAdminApi();
const auth = useAuthStore();
const queryClient = useQueryClient();
const list = useQuery({
  queryKey: ['admin-categories'],
  queryFn: () => api.get<AdminCategory[]>('/categories'),
});

/** Parents first, children indented under them. */
const rows = computed(() => {
  const all = list.data.value ?? [];
  const out: (AdminCategory & { depth: number })[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const c of all.filter((x) => x.parentId === parentId)) {
      out.push({ ...c, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
});

const blank = () => ({
  name: '',
  slug: '',
  parentId: '' as string,
  description: '',
  imageKey: null as string | null,
  imageUrl: null as string | null,
  sortOrder: 0,
  isVisible: true,
  showOnHomepage: false,
  seoTitle: '',
  seoDescription: '',
});
const form = reactive(blank());
const editing = ref<string | null>(null);
const open = ref(false);
const slugTouched = ref(false);
const error = ref('');
const fields = ref<Record<string, string>>({});
watch(
  () => form.name,
  (n) => {
    if (!slugTouched.value) form.slug = slugify(n);
  },
);

function edit(c?: AdminCategory) {
  Object.assign(
    form,
    blank(),
    c
      ? {
          ...c,
          parentId: c.parentId ?? '',
          description: c.description ?? '',
          seoTitle: c.seoTitle ?? '',
          seoDescription: c.seoDescription ?? '',
        }
      : {},
  );
  editing.value = c?.id ?? null;
  slugTouched.value = Boolean(c);
  error.value = '';
  fields.value = {};
  open.value = true;
}
const save = useMutation({
  mutationFn: () => {
    const body = {
      name: form.name,
      slug: form.slug,
      parentId: form.parentId || null,
      description: form.description || null,
      imageKey: form.imageKey,
      sortOrder: Number(form.sortOrder) || 0,
      isVisible: form.isVisible,
      showOnHomepage: form.showOnHomepage,
      seoTitle: form.seoTitle || null,
      seoDescription: form.seoDescription || null,
    };
    return editing.value
      ? api.put(`/categories/${editing.value}`, body)
      : api.post('/categories', body);
  },
  onSuccess: async () => {
    open.value = false;
    await queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
  },
  onError: (e) => {
    error.value = errorMessage(e);
    fields.value = fieldErrors(e);
  },
});
const remove = useMutation({
  mutationFn: () => api.del(`/categories/${editing.value}`),
  onSuccess: async () => {
    open.value = false;
    await queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
  },
  onError: (e) => (error.value = errorMessage(e)),
});
function setImage(m: MediaUpload) {
  form.imageKey = m.storageKey;
  form.imageUrl = m.url;
}
</script>

<template>
  <div>
    <PageHeader
      title="Categories"
      description="Shown in the store's menu and filters. Hide a category instead of deleting it."
    >
      <button
        v-if="auth.can('categories:write')"
        type="button"
        class="btn btn-primary"
        @click="edit()"
      >
        <Plus class="size-4" aria-hidden="true" /> New category
      </button>
    </PageHeader>
    <div class="card overflow-hidden">
      <ErrorNotice
        v-if="list.isError.value"
        class="m-4"
        :message="errorMessage(list.error.value)"
      />
      <LoadingState v-else-if="list.isPending.value" />
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Products</th>
            <th>Visible</th>
            <th>Homepage</th>
            <th class="sr-only">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in rows" :key="c.id">
            <td :style="{ paddingLeft: `${1 + c.depth * 1.5}rem` }" class="font-medium">
              <span v-if="c.depth" class="text-ink-muted" aria-hidden="true">└ </span>{{ c.name }}
            </td>
            <td class="font-mono text-xs text-ink-muted">{{ c.slug }}</td>
            <td class="tabular-nums">{{ c.productCount }}</td>
            <td>{{ c.isVisible ? 'Yes' : 'Hidden' }}</td>
            <td>{{ c.showOnHomepage ? 'Yes' : '—' }}</td>
            <td class="text-right">
              <button
                v-if="auth.can('categories:write')"
                type="button"
                class="btn btn-ghost !py-1"
                @click="edit(c)"
              >
                Edit
              </button>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="6" class="py-10 text-center text-ink-muted">No categories yet.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <AppDialog
      :open="open"
      :title="editing ? 'Edit category' : 'New category'"
      @close="open = false"
    >
      <form id="category-form" class="space-y-4" @submit.prevent="save.mutate()">
        <ErrorNotice :message="error" />
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label for="c-name" class="field-label">Name</label>
            <input
              id="c-name"
              v-model="form.name"
              class="field-input"
              required
              :aria-invalid="!!fields.name"
            />
          </div>
          <div>
            <label for="c-slug" class="field-label">URL slug</label>
            <input
              id="c-slug"
              v-model="form.slug"
              class="field-input font-mono"
              required
              :aria-invalid="!!fields.slug"
              @input="slugTouched = true"
            />
            <p v-if="fields.slug" class="mt-1 text-xs text-red-700">{{ fields.slug }}</p>
          </div>
        </div>
        <div>
          <label for="c-parent" class="field-label">Parent category</label>
          <select id="c-parent" v-model="form.parentId" class="field-input">
            <option value="">None (top level)</option>
            <option v-for="c in rows.filter((r) => r.id !== editing)" :key="c.id" :value="c.id">
              {{ '— '.repeat(c.depth) }}{{ c.name }}
            </option>
          </select>
        </div>
        <div>
          <label for="c-desc" class="field-label">Description</label>
          <textarea
            id="c-desc"
            v-model="form.description"
            rows="2"
            class="field-input"
            maxlength="500"
          />
        </div>
        <div class="flex items-center gap-3">
          <img
            v-if="form.imageUrl"
            :src="form.imageUrl"
            alt=""
            class="size-16 rounded-lg border border-slate-100 object-contain"
          />
          <ImageUploader
            class="flex-1"
            folder="categories"
            label="Upload category image"
            @uploaded="setImage"
          />
        </div>
        <div class="flex flex-wrap gap-4 text-sm">
          <label class="flex items-center gap-2"
            ><input v-model="form.isVisible" type="checkbox" /> Visible in the store</label
          >
          <label class="flex items-center gap-2"
            ><input v-model="form.showOnHomepage" type="checkbox" /> Show on homepage</label
          >
          <label class="flex items-center gap-2"
            >Order
            <input
              v-model.number="form.sortOrder"
              type="number"
              min="0"
              class="field-input !w-20 !py-1"
          /></label>
        </div>
      </form>
      <template #footer>
        <button
          v-if="editing"
          type="button"
          class="btn btn-ghost mr-auto !text-red-700"
          :disabled="remove.isPending.value"
          @click="remove.mutate()"
        >
          Delete
        </button>
        <button type="button" class="btn btn-secondary" @click="open = false">Cancel</button>
        <button
          type="submit"
          form="category-form"
          class="btn btn-primary"
          :disabled="save.isPending.value"
        >
          Save
        </button>
      </template>
    </AppDialog>
  </div>
</template>
