<script setup lang="ts">
import { ref } from 'vue';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { Download, Search } from 'lucide-vue-next';
import type { AdminSubscriber, Paginated } from '@repo/shared-types';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import PaginationBar from '@/components/ui/PaginationBar.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { useListQuery } from '@/composables/useListQuery';
import { getAccessToken } from '@/lib/api';
import { env } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { formatDate, humanize } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';

type SubscriberPage = Paginated<AdminSubscriber> & { counts: Record<string, number> };
const api = useAdminApi();
const auth = useAuthStore();
const { filters, setPage, params } = useListQuery({ status: '', q: '' });
const list = useQuery({
  queryKey: ['admin-subscribers', params],
  queryFn: () => api.get<SubscriberPage>('/newsletter/subscribers', params.value),
  placeholderData: keepPreviousData,
});
const exportError = ref('');
const exporting = ref(false);

/** Downloads confirmed subscribers (with unsubscribe links) as CSV for the sending tool. */
async function exportCsv() {
  exportError.value = '';
  exporting.value = true;
  try {
    const fetchCsv = () =>
      fetch(`${env.VITE_API_URL}/admin/newsletter/export.csv`, {
        headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
      });
    let res = await fetchCsv();
    if (res.status === 401 && (await auth.ensureSession())) res = await fetchCsv();
    if (!res.ok) throw new Error();
    const url = URL.createObjectURL(await res.blob());
    const link = Object.assign(document.createElement('a'), {
      href: url,
      download: 'newsletter-subscribers.csv',
    });
    link.click();
    URL.revokeObjectURL(url);
  } catch {
    exportError.value = 'Could not export the list. Try again.';
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Newsletter"
      description="People join from the store footer and confirm by email (double opt-in)."
    >
      <button type="button" class="btn btn-secondary" :disabled="exporting" @click="exportCsv">
        <Download class="size-4" aria-hidden="true" /> Export subscribers (CSV)
      </button>
    </PageHeader>
    <ErrorNotice :message="exportError" class="mb-3" />
    <div v-if="list.data.value" class="mb-4 grid gap-4 sm:grid-cols-3">
      <div v-for="s in ['SUBSCRIBED', 'PENDING', 'UNSUBSCRIBED']" :key="s" class="card p-4">
        <p class="text-sm text-ink-muted">
          {{ s === 'PENDING' ? 'Not confirmed yet' : humanize(s) }}
        </p>
        <p class="mt-1 text-2xl font-bold tabular-nums">{{ list.data.value.counts[s] ?? 0 }}</p>
      </div>
    </div>
    <div class="card overflow-hidden">
      <form
        class="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_auto]"
        role="search"
        @submit.prevent
      >
        <label class="relative">
          <span class="sr-only">Search email</span>
          <Search
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            v-model.lazy="filters.q"
            type="search"
            class="field-input !pl-9"
            placeholder="Email address"
          />
        </label>
        <select v-model="filters.status" class="field-input" aria-label="Status">
          <option value="">All</option>
          <option value="SUBSCRIBED">Subscribed</option>
          <option value="PENDING">Not confirmed</option>
          <option value="UNSUBSCRIBED">Unsubscribed</option>
        </select>
      </form>
      <ErrorNotice
        v-if="list.isError.value"
        class="m-4"
        :message="errorMessage(list.error.value)"
      />
      <LoadingState v-else-if="list.isPending.value" />
      <template v-else-if="list.data.value">
        <table class="data-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Status</th>
              <th>Signed up</th>
              <th>Confirmed</th>
              <th>From</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in list.data.value.items" :key="s.id">
              <td>{{ s.email }}</td>
              <td>{{ s.status === 'PENDING' ? 'Not confirmed' : humanize(s.status) }}</td>
              <td class="text-ink-muted">{{ formatDate(s.consentAt) }}</td>
              <td class="text-ink-muted">{{ formatDate(s.confirmedAt) }}</td>
              <td class="text-ink-muted">{{ s.source ?? '—' }}</td>
            </tr>
            <tr v-if="!list.data.value.items.length">
              <td colspan="5" class="py-10 text-center text-ink-muted">No subscribers yet.</td>
            </tr>
          </tbody>
        </table>
        <PaginationBar v-bind="list.data.value" @change="setPage" />
      </template>
    </div>
  </div>
</template>
