<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { BadgeCheck, Star } from 'lucide-vue-next';
import type { AdminReview, Paginated } from '@repo/shared-types';
import AppDialog from '@/components/ui/AppDialog.vue';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import PaginationBar from '@/components/ui/PaginationBar.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { useListQuery } from '@/composables/useListQuery';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';

const api = useAdminApi();
const queryClient = useQueryClient();
const { filters, setPage, params } = useListQuery({ status: 'PENDING' });
const list = useQuery({
  queryKey: ['admin-reviews', params],
  queryFn: () => api.get<Paginated<AdminReview>>('/reviews', params.value),
  placeholderData: keepPreviousData,
});
const TABS = [
  { value: 'PENDING', label: 'Waiting' },
  { value: 'APPROVED', label: 'Published' },
  { value: 'REJECTED', label: 'Rejected' },
];

const rejecting = ref<AdminReview | null>(null);
const note = ref('');
const error = ref('');
const moderate = useMutation({
  mutationFn: (input: { id: string; status: 'APPROVED' | 'REJECTED'; note?: string }) =>
    api.post(`/reviews/${input.id}/moderate`, { status: input.status, note: input.note }),
  onSuccess: async () => {
    rejecting.value = null;
    note.value = '';
    error.value = '';
    await queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });
  },
  onError: (e) => (error.value = errorMessage(e)),
});
</script>

<template>
  <div>
    <PageHeader
      title="Reviews"
      description="Only customers whose order was delivered can review. Nothing is shown in the store until you publish it."
    />
    <div class="mb-4 inline-flex rounded-full border border-slate-200 bg-white p-1" role="tablist">
      <button
        v-for="t in TABS"
        :key="t.value"
        type="button"
        role="tab"
        :aria-selected="filters.status === t.value"
        :class="[
          'rounded-full px-4 py-1 text-sm font-medium',
          filters.status === t.value ? 'bg-navy-950 text-white' : 'text-ink-muted',
        ]"
        @click="filters.status = t.value"
      >
        {{ t.label }}
      </button>
    </div>
    <ErrorNotice :message="error" class="mb-4" />
    <ErrorNotice v-if="list.isError.value" :message="errorMessage(list.error.value)" />
    <LoadingState v-else-if="list.isPending.value" />
    <template v-else-if="list.data.value">
      <p v-if="!list.data.value.items.length" class="card p-10 text-center text-sm text-ink-muted">
        Nothing here.
      </p>
      <ul class="space-y-3">
        <li v-for="r in list.data.value.items" :key="r.id" class="card p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="flex items-center gap-1" :aria-label="`${r.rating} out of 5 stars`">
                <Star
                  v-for="n in 5"
                  :key="n"
                  :class="[
                    'size-4',
                    n <= r.rating
                      ? 'fill-amber-400 text-amber-400'
                      : 'fill-slate-200 text-slate-200',
                  ]"
                  aria-hidden="true"
                />
                <span v-if="r.title" class="ml-2 font-semibold">{{ r.title }}</span>
              </p>
              <p class="mt-2 whitespace-pre-line text-sm">{{ r.body }}</p>
              <p class="mt-3 text-xs text-ink-muted">
                {{ r.author.name }} ({{ r.author.email }}) on
                <RouterLink
                  :to="{ name: 'product', params: { id: r.product.id } }"
                  class="text-brand-blue hover:underline"
                  >{{ r.product.name }}</RouterLink
                >
                · {{ formatDateTime(r.createdAt) }}
                <span
                  v-if="r.verifiedPurchase"
                  class="ml-1 inline-flex items-center gap-0.5 text-emerald-700"
                >
                  <BadgeCheck class="size-3.5" aria-hidden="true" /> verified purchase
                </span>
              </p>
              <p v-if="r.moderatedBy" class="mt-1 text-xs text-ink-muted">
                {{ r.status === 'APPROVED' ? 'Published' : 'Rejected' }} by {{ r.moderatedBy }}
                {{ formatDateTime(r.moderatedAt) }}
                <template v-if="r.moderationNote"> · “{{ r.moderationNote }}”</template>
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <StatusBadge :status="r.status === 'APPROVED' ? 'PUBLISHED' : r.status" />
              <button
                v-if="r.status !== 'APPROVED'"
                type="button"
                class="btn btn-primary !py-1.5"
                :disabled="moderate.isPending.value"
                @click="moderate.mutate({ id: r.id, status: 'APPROVED' })"
              >
                Publish
              </button>
              <button
                v-if="r.status !== 'REJECTED'"
                type="button"
                class="btn btn-secondary !py-1.5"
                @click="
                  rejecting = r;
                  error = '';
                "
              >
                Reject
              </button>
            </div>
          </div>
        </li>
      </ul>
      <div class="card mt-3 overflow-hidden">
        <PaginationBar v-bind="list.data.value" @change="setPage" />
      </div>
    </template>

    <AppDialog :open="rejecting !== null" title="Reject review" @close="rejecting = null">
      <form
        id="reject-form"
        class="space-y-3"
        @submit.prevent="moderate.mutate({ id: rejecting!.id, status: 'REJECTED', note })"
      >
        <ErrorNotice :message="error" />
        <p class="text-sm text-ink-muted">
          Rejected reviews stay private. The customer can edit and resubmit.
        </p>
        <label for="reject-note" class="field-label">Reason (for the team)</label>
        <input
          id="reject-note"
          v-model="note"
          class="field-input"
          required
          minlength="3"
          maxlength="300"
          placeholder="e.g. Contains a phone number"
        />
      </form>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="rejecting = null">Cancel</button>
        <button
          type="submit"
          form="reject-form"
          class="btn btn-danger"
          :disabled="moderate.isPending.value"
        >
          Reject
        </button>
      </template>
    </AppDialog>
  </div>
</template>
