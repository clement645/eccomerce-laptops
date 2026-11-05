<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { ImageOff, Plus, Search } from 'lucide-vue-next';
import type {
  AdminBrand,
  AdminCategory,
  AdminProductListItem,
  Paginated,
} from '@repo/shared-types';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import PaginationBar from '@/components/ui/PaginationBar.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { useListQuery } from '@/composables/useListQuery';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatKes } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';

const api = useAdminApi();
const auth = useAuthStore();
const { filters, setPage, params } = useListQuery({
  q: '',
  status: '',
  categoryId: '',
  brandId: '',
});
const query = useQuery({
  queryKey: ['admin-products', params],
  queryFn: () => api.get<Paginated<AdminProductListItem>>('/products', params.value),
  placeholderData: keepPreviousData,
});
const categories = useQuery({
  queryKey: ['admin-categories'],
  queryFn: () => api.get<AdminCategory[]>('/categories'),
});
const brands = useQuery({
  queryKey: ['admin-brands'],
  queryFn: () => api.get<AdminBrand[]>('/brands'),
});
</script>

<template>
  <div>
    <PageHeader
      title="Products"
      description="New products start as drafts. Publish them when they are ready."
    >
      <RouterLink
        v-if="auth.can('products:write')"
        :to="{ name: 'product-new' }"
        class="btn btn-primary"
      >
        <Plus class="size-4" aria-hidden="true" /> New product
      </RouterLink>
    </PageHeader>
    <div class="card overflow-hidden">
      <form
        class="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_auto_auto_auto]"
        role="search"
        @submit.prevent
      >
        <label class="relative">
          <span class="sr-only">Search products</span>
          <Search
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            v-model.lazy="filters.q"
            type="search"
            class="field-input !pl-9"
            placeholder="Name, slug or SKU"
          />
        </label>
        <select v-model="filters.status" class="field-input" aria-label="Status">
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <select v-model="filters.categoryId" class="field-input" aria-label="Category">
          <option value="">All categories</option>
          <option v-for="c in categories.data.value" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <select v-model="filters.brandId" class="field-input" aria-label="Brand">
          <option value="">All brands</option>
          <option v-for="b in brands.data.value" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
      </form>
      <ErrorNotice
        v-if="query.isError.value"
        class="m-4"
        :message="errorMessage(query.error.value)"
      />
      <LoadingState v-else-if="query.isPending.value" />
      <template v-else-if="query.data.value">
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Available</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in query.data.value.items" :key="p.id">
                <td>
                  <RouterLink
                    :to="{ name: 'product', params: { id: p.id } }"
                    class="flex items-center gap-3 font-medium hover:text-brand-blue"
                  >
                    <img
                      v-if="p.imageUrl"
                      :src="p.imageUrl"
                      alt=""
                      class="size-10 rounded-lg border border-slate-100 object-contain"
                      loading="lazy"
                    />
                    <span
                      v-else
                      class="grid size-10 place-items-center rounded-lg bg-slate-100 text-ink-muted"
                      ><ImageOff class="size-4" aria-hidden="true"
                    /></span>
                    <span
                      >{{ p.name
                      }}<span class="block text-xs font-normal text-ink-muted"
                        >{{ p.brand.name }} · {{ p.variantCount }} variant{{
                          p.variantCount === 1 ? '' : 's'
                        }}</span
                      ></span
                    >
                  </RouterLink>
                </td>
                <td>{{ p.category.name }}</td>
                <td class="tabular-nums">{{ formatKes(p.priceMinor) }}</td>
                <td
                  :class="['tabular-nums', p.available === 0 ? 'font-semibold text-red-700' : '']"
                >
                  {{ p.available }}
                </td>
                <td><StatusBadge :status="p.status" /></td>
                <td class="text-ink-muted">{{ formatDate(p.updatedAt) }}</td>
              </tr>
              <tr v-if="!query.data.value.items.length">
                <td colspan="6" class="py-10 text-center text-ink-muted">No products match.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <PaginationBar v-bind="query.data.value" @change="setPage" />
      </template>
    </div>
  </div>
</template>
