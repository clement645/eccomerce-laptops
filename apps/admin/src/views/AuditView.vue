<script setup lang="ts">
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import type { AuditLogEntry, Paginated } from '@repo/shared-types';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import PaginationBar from '@/components/ui/PaginationBar.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { useListQuery } from '@/composables/useListQuery';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';

const api = useAdminApi();
const { setPage, params } = useListQuery({});
const list = useQuery({
  queryKey: ['admin-audit', params],
  queryFn: () =>
    api.get<Paginated<AuditLogEntry>>('/audit-logs', { page: params.value.page, pageSize: 50 }),
  placeholderData: keepPreviousData,
});
</script>

<template>
  <div>
    <PageHeader
      title="Audit log"
      description="Security and administrative actions, newest first. Entries cannot be edited."
    />
    <div class="card overflow-hidden">
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
                <th>When</th>
                <th>Action</th>
                <th>Record</th>
                <th>By</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in list.data.value.items" :key="e.id">
                <td class="whitespace-nowrap text-xs">{{ formatDateTime(e.createdAt) }}</td>
                <td class="font-mono text-xs">{{ e.action }}</td>
                <td class="text-xs">
                  {{ e.entityType
                  }}<span v-if="e.entityId" class="block font-mono text-ink-muted">{{
                    e.entityId
                  }}</span>
                </td>
                <td class="text-xs">{{ e.actor?.email ?? 'System' }}</td>
                <td class="font-mono text-xs text-ink-muted">{{ e.ip ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <PaginationBar v-bind="list.data.value" @change="setPage" />
      </template>
    </div>
  </div>
</template>
