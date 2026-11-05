<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-vue-next';
import type { AdminHomepageSection, AdminProductListItem, Paginated } from '@repo/shared-types';
import AppDialog from '@/components/ui/AppDialog.vue';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { errorMessage } from '@/lib/errors';
import { humanize } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';

const api = useAdminApi();
const auth = useAuthStore();
const queryClient = useQueryClient();
const list = useQuery({
  queryKey: ['admin-sections'],
  queryFn: () => api.get<AdminHomepageSection[]>('/homepage-sections'),
});
const SOURCE: Record<string, string> = {
  best_sellers: 'Fills itself with best sellers',
  newest: 'Fills itself with the newest products',
  featured: 'Fills itself with featured products',
  category: 'Fills itself from a category',
  on_sale: 'Fills itself with discounted products',
  curated: 'Products chosen by hand',
};

const editing = ref<AdminHomepageSection | null>(null);
const form = reactive({
  title: '',
  subtitle: '',
  isActive: true,
  sortOrder: 0,
  products: [] as { productId: string; name: string }[],
});
const error = ref('');
const search = ref('');
function edit(s: AdminHomepageSection) {
  editing.value = s;
  Object.assign(form, {
    title: s.title,
    subtitle: s.subtitle ?? '',
    isActive: s.isActive,
    sortOrder: s.sortOrder,
    products: s.items.map((i) => ({ productId: i.productId, name: i.name })),
  });
  error.value = '';
  search.value = '';
}
const results = useQuery({
  queryKey: computed(() => [
    'admin-products',
    { q: search.value, status: 'PUBLISHED', pageSize: 8 },
  ]),
  queryFn: () =>
    api.get<Paginated<AdminProductListItem>>('/products', {
      q: search.value,
      status: 'PUBLISHED',
      pageSize: 8,
    }),
  enabled: computed(() => search.value.trim().length >= 2 && auth.can('products:read')),
});
function move(i: number, by: -1 | 1) {
  const j = i + by;
  if (j < 0 || j >= form.products.length) return;
  const [item] = form.products.splice(i, 1);
  form.products.splice(j, 0, item!);
}
const save = useMutation({
  mutationFn: () =>
    api.put(`/homepage-sections/${editing.value!.id}`, {
      title: form.title,
      subtitle: form.subtitle || null,
      isActive: form.isActive,
      sortOrder: Number(form.sortOrder) || 0,
      productIds: form.products.map((p) => p.productId),
    }),
  onSuccess: async () => {
    editing.value = null;
    await queryClient.invalidateQueries({ queryKey: ['admin-sections'] });
  },
  onError: (e) => (error.value = errorMessage(e)),
});
</script>

<template>
  <div>
    <PageHeader
      title="Homepage sections"
      description="Product rows on the storefront homepage, in display order."
    />
    <ErrorNotice v-if="list.isError.value" :message="errorMessage(list.error.value)" />
    <LoadingState v-else-if="list.isPending.value" />
    <div v-else class="card overflow-hidden">
      <table class="data-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Section</th>
            <th>Content</th>
            <th>Shown</th>
            <th class="sr-only">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in list.data.value" :key="s.id">
            <td class="tabular-nums">{{ s.sortOrder }}</td>
            <td class="font-medium">
              {{ s.title }}<span class="block text-xs text-ink-muted">{{ s.subtitle }}</span>
            </td>
            <td class="text-sm">
              {{ SOURCE[s.source] ?? humanize(s.source) }}
              <span v-if="s.source === 'curated'" class="block text-xs text-ink-muted"
                >{{ s.items.length }} product{{ s.items.length === 1 ? '' : 's' }}</span
              >
            </td>
            <td>{{ s.isActive ? 'Yes' : 'Hidden' }}</td>
            <td class="text-right">
              <button type="button" class="btn btn-ghost !py-1" @click="edit(s)">Edit</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AppDialog
      :open="editing !== null"
      :title="`Edit section · ${editing?.key ?? ''}`"
      wide
      @close="editing = null"
    >
      <form id="section-form" class="space-y-4" @submit.prevent="save.mutate()">
        <ErrorNotice :message="error" />
        <div class="grid gap-3 md:grid-cols-2">
          <div>
            <label for="s-title" class="field-label">Title</label
            ><input
              id="s-title"
              v-model="form.title"
              class="field-input"
              required
              minlength="2"
              maxlength="80"
            />
          </div>
          <div>
            <label for="s-sub" class="field-label">Subtitle</label
            ><input id="s-sub" v-model="form.subtitle" class="field-input" maxlength="200" />
          </div>
        </div>
        <div class="flex items-center gap-4 text-sm">
          <label class="flex items-center gap-2"
            ><input v-model="form.isActive" type="checkbox" /> Show on homepage</label
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
        <template v-if="editing?.source === 'curated'">
          <h3 class="font-semibold">Products</h3>
          <ol class="space-y-2">
            <li
              v-for="(p, i) in form.products"
              :key="p.productId"
              class="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <span class="w-5 text-ink-muted tabular-nums">{{ i + 1 }}</span>
              <span class="flex-1 truncate">{{ p.name }}</span>
              <button
                type="button"
                class="btn btn-ghost !p-1"
                :aria-label="`Move ${p.name} up`"
                :disabled="i === 0"
                @click="move(i, -1)"
              >
                <ArrowUp class="size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="btn btn-ghost !p-1"
                :aria-label="`Move ${p.name} down`"
                :disabled="i === form.products.length - 1"
                @click="move(i, 1)"
              >
                <ArrowDown class="size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="btn btn-ghost !p-1"
                :aria-label="`Remove ${p.name}`"
                @click="form.products.splice(i, 1)"
              >
                <Trash2 class="size-3.5" aria-hidden="true" />
              </button>
            </li>
            <li v-if="!form.products.length" class="text-sm text-ink-muted">
              No products yet. Search below to add some.
            </li>
          </ol>
          <div>
            <label for="product-search" class="field-label">Add a published product</label>
            <input
              id="product-search"
              v-model="search"
              type="search"
              class="field-input"
              placeholder="Type at least 2 letters"
            />
            <ul
              v-if="results.data.value"
              class="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200"
            >
              <li
                v-for="r in results.data.value.items"
                :key="r.id"
                class="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span class="truncate"
                  >{{ r.name }} <StatusBadge :status="r.status" class="ml-1"
                /></span>
                <button
                  type="button"
                  class="btn btn-secondary !py-1"
                  :disabled="
                    form.products.some((p) => p.productId === r.id) || form.products.length >= 24
                  "
                  @click="form.products.push({ productId: r.id, name: r.name })"
                >
                  <Plus class="size-3.5" aria-hidden="true" /> Add
                </button>
              </li>
              <li v-if="!results.data.value.items.length" class="px-3 py-2 text-sm text-ink-muted">
                No published products match.
              </li>
            </ul>
          </div>
        </template>
      </form>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="editing = null">Cancel</button>
        <button
          type="submit"
          form="section-form"
          class="btn btn-primary"
          :disabled="save.isPending.value"
        >
          Save
        </button>
      </template>
    </AppDialog>
  </div>
</template>
