<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { Search } from 'lucide-vue-next';
import type { AdminCustomerSummary, Paginated } from '@repo/shared-types';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import PaginationBar from '@/components/ui/PaginationBar.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { useListQuery } from '@/composables/useListQuery';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatKes } from '@/lib/format';

const api = useAdminApi();
const { filters, setPage, params } = useListQuery({ q: '', status: '' });
const list = useQuery({
  queryKey: ['admin-customers', params],
  queryFn: () => api.get<Paginated<AdminCustomerSummary>>('/customers', params.value),
  placeholderData: keepPreviousData,
});
</script>

<template>
  <div>
    <PageHeader
      title="Customers"
      description="Registered accounts. Guest checkouts appear only on their orders."
    />
    <div class="card overflow-hidden">
      <form
        class="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_auto]"
        role="search"
        @submit.prevent
      >
        <label class="relative">
          <span class="sr-only">Search customers</span>
          <Search
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            v-model.lazy="filters.q"
            type="search"
            class="field-input !pl-9"
            placeholder="Name, email or phone"
          />
        </label>
        <select v-model="filters.status" class="field-input" aria-label="Status">
          <option value="">All</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </form>
      <ErrorNotice
        v-if="list.isError.value"
        class="m-4"
        :message="errorMessage(list.error.value)"
      />
      <LoadingState v-else-if="list.isPending.value" />
      <template v-else-if="list.data.value">
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Orders</th>
                <th>Spent</th>
                <th>Joined</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in list.data.value.items" :key="c.id">
                <td>
                  <RouterLink
                    :to="{ name: 'customer', params: { id: c.id } }"
                    class="font-medium hover:text-brand-blue"
                    >{{ c.name }}</RouterLink
                  >
                  <span class="block text-xs text-ink-muted"
                    >{{ c.email }}<template v-if="!c.emailVerified"> · unverified</template></span
                  >
                </td>
                <td class="tabular-nums">{{ c.phone ? `+${c.phone}` : '—' }}</td>
                <td class="tabular-nums">{{ c.orderCount }}</td>
                <td class="tabular-nums">{{ formatKes(c.totalSpentMinor) }}</td>
                <td class="text-ink-muted">{{ formatDate(c.createdAt) }}</td>
                <td><StatusBadge :status="c.status" /></td>
              </tr>
              <tr v-if="!list.data.value.items.length">
                <td colspan="6" class="py-10 text-center text-ink-muted">No customers match.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <PaginationBar v-bind="list.data.value" @change="setPage" />
      </template>
    </div>
  </div>
</template>
