<script setup lang="ts">
import { ref } from 'vue';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { Mail, Phone, Search } from 'lucide-vue-next';
import type { AdminContactMessage, ContactStatus, Paginated } from '@repo/shared-types';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import PaginationBar from '@/components/ui/PaginationBar.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { useListQuery } from '@/composables/useListQuery';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, humanize } from '@/lib/format';

type MessagePage = Paginated<AdminContactMessage> & { counts: Record<string, number> };
const api = useAdminApi();
const queryClient = useQueryClient();
const { filters, setPage, params } = useListQuery({ status: '', q: '' });
const list = useQuery({
  queryKey: ['admin-messages', params],
  queryFn: () => api.get<MessagePage>('/messages', params.value),
  placeholderData: keepPreviousData,
  refetchInterval: 60_000,
});
const TABS: { value: string; label: string }[] = [
  { value: '', label: 'Open' },
  { value: 'NEW', label: 'New' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'SPAM', label: 'Spam' },
];
const STATUSES: ContactStatus[] = ['NEW', 'IN_PROGRESS', 'RESOLVED', 'SPAM'];
const expanded = ref<string | null>(null);
const error = ref('');
const setStatus = useMutation({
  mutationFn: (input: { id: string; status: ContactStatus }) =>
    api.post(`/messages/${input.id}/status`, { status: input.status }),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-messages'] }),
  onError: (e) => (error.value = errorMessage(e)),
});
</script>

<template>
  <div>
    <PageHeader
      title="Messages"
      description="Sent from the storefront contact page. Reply by email; replies go straight to the customer."
    />
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div
        class="inline-flex flex-wrap rounded-full border border-slate-200 bg-white p-1"
        role="tablist"
      >
        <button
          v-for="t in TABS"
          :key="t.value"
          type="button"
          role="tab"
          :aria-selected="filters.status === t.value"
          :class="[
            'rounded-full px-3 py-1 text-sm font-medium',
            filters.status === t.value ? 'bg-navy-950 text-white' : 'text-ink-muted',
          ]"
          @click="filters.status = t.value"
        >
          {{ t.label }}
          <span
            v-if="t.value && list.data.value?.counts[t.value]"
            class="ml-1 text-xs opacity-70"
            >{{ list.data.value.counts[t.value] }}</span
          >
        </button>
      </div>
      <label class="relative w-full max-w-xs">
        <span class="sr-only">Search messages</span>
        <Search
          class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
          aria-hidden="true"
        />
        <input
          v-model.lazy="filters.q"
          type="search"
          class="field-input !pl-9"
          placeholder="Name, email or subject"
        />
      </label>
    </div>
    <ErrorNotice :message="error" class="mb-3" />
    <ErrorNotice v-if="list.isError.value" :message="errorMessage(list.error.value)" />
    <LoadingState v-else-if="list.isPending.value" />
    <div v-else-if="list.data.value" class="card overflow-hidden">
      <ul class="divide-y divide-slate-100">
        <li v-for="m in list.data.value.items" :key="m.id" class="p-4">
          <button
            type="button"
            class="flex w-full flex-wrap items-center justify-between gap-2 text-left"
            :aria-expanded="expanded === m.id"
            @click="expanded = expanded === m.id ? null : m.id"
          >
            <span class="min-w-0">
              <span :class="['block truncate', m.status === 'NEW' ? 'font-bold' : 'font-medium']">{{
                m.subject
              }}</span>
              <span class="block text-xs text-ink-muted"
                >{{ m.name }} · {{ formatDateTime(m.createdAt) }}</span
              >
            </span>
            <StatusBadge :status="m.status" />
          </button>
          <div v-if="expanded === m.id" class="mt-3 space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
            <p class="whitespace-pre-line">{{ m.message }}</p>
            <p class="flex flex-wrap gap-4 text-ink-muted">
              <a
                :href="`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`"
                class="inline-flex items-center gap-1 text-brand-blue hover:underline"
              >
                <Mail class="size-4" aria-hidden="true" /> {{ m.email }}
              </a>
              <a
                v-if="m.phone"
                :href="`tel:+${m.phone}`"
                class="inline-flex items-center gap-1 text-brand-blue hover:underline"
              >
                <Phone class="size-4" aria-hidden="true" /> +{{ m.phone }}
              </a>
            </p>
            <label class="flex items-center gap-2">
              <span class="text-ink-muted">Status</span>
              <select
                :value="m.status"
                class="field-input !w-auto !py-1"
                @change="
                  setStatus.mutate({
                    id: m.id,
                    status: ($event.target as HTMLSelectElement).value as ContactStatus,
                  })
                "
              >
                <option v-for="s in STATUSES" :key="s" :value="s">{{ humanize(s) }}</option>
              </select>
              <span v-if="m.handledBy" class="text-xs text-ink-muted"
                >last updated by {{ m.handledBy }}</span
              >
            </label>
          </div>
        </li>
        <li v-if="!list.data.value.items.length" class="p-10 text-center text-sm text-ink-muted">
          No messages.
        </li>
      </ul>
      <PaginationBar v-bind="list.data.value" @change="setPage" />
    </div>
  </div>
</template>
