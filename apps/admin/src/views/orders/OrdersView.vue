<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { Search } from 'lucide-vue-next';
import type { AdminOrderSummary, Paginated } from '@repo/shared-types';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import PaginationBar from '@/components/ui/PaginationBar.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { useListQuery } from '@/composables/useListQuery';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatKes, humanize } from '@/lib/format';

const api = useAdminApi();
const { filters, setPage, params } = useListQuery({
  q: '',
  status: '',
  payment: '',
  from: '',
  to: '',
});
const query = useQuery({
  queryKey: ['admin-orders', params],
  queryFn: () =>
    api.get<Paginated<AdminOrderSummary>>('/orders', {
      q: params.value.q,
      fulfillmentStatus: params.value.status,
      paymentStatus: params.value.payment,
      from: params.value.from,
      to: params.value.to,
      page: params.value.page,
    }),
  placeholderData: keepPreviousData,
  refetchInterval: 30_000,
});
const FULFILMENT = ['PENDING', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
const PAYMENT = ['UNPAID', 'PENDING', 'PAID', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED'];
</script>

<template>
  <div>
    <PageHeader
      title="Orders"
      description="Newest first. Click an order to fulfil, cancel or refund it."
    />
    <div class="card overflow-hidden">
      <form
        class="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_auto_auto_auto_auto]"
        role="search"
        @submit.prevent
      >
        <label class="relative">
          <span class="sr-only">Search orders</span>
          <Search
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            v-model.lazy="filters.q"
            type="search"
            class="field-input !pl-9"
            placeholder="Order number, email, phone or name"
          />
        </label>
        <label>
          <span class="sr-only">Fulfilment status</span>
          <select v-model="filters.status" class="field-input">
            <option value="">All fulfilment</option>
            <option v-for="s in FULFILMENT" :key="s" :value="s">{{ humanize(s) }}</option>
          </select>
        </label>
        <label>
          <span class="sr-only">Payment status</span>
          <select v-model="filters.payment" class="field-input">
            <option value="">All payments</option>
            <option v-for="s in PAYMENT" :key="s" :value="s">{{ humanize(s) }}</option>
          </select>
        </label>
        <label>
          <span class="sr-only">Placed from</span>
          <input v-model="filters.from" type="date" class="field-input" aria-label="Placed from" />
        </label>
        <label>
          <span class="sr-only">Placed until</span>
          <input v-model="filters.to" type="date" class="field-input" aria-label="Placed until" />
        </label>
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
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Fulfilment</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in query.data.value.items" :key="o.id">
                <td>
                  <RouterLink
                    :to="{ name: 'order', params: { orderNumber: o.orderNumber } }"
                    class="whitespace-nowrap font-semibold text-brand-blue hover:underline"
                  >
                    {{ o.orderNumber }}
                  </RouterLink>
                  <span class="block text-xs text-ink-muted">{{ formatDateTime(o.placedAt) }}</span>
                </td>
                <td>
                  {{ o.customerName
                  }}<span class="block text-xs text-ink-muted">{{ o.email }}</span>
                </td>
                <td class="tabular-nums">{{ o.itemCount }}</td>
                <td class="tabular-nums">{{ formatKes(o.totalMinor) }}</td>
                <td>
                  <StatusBadge :status="o.paymentStatus" />
                  <span class="mt-0.5 block text-xs text-ink-muted">{{
                    o.paymentProvider === 'CASH_ON_DELIVERY' ? 'Cash on delivery' : 'M-Pesa'
                  }}</span>
                </td>
                <td><StatusBadge :status="o.fulfillmentStatus" /></td>
              </tr>
              <tr v-if="!query.data.value.items.length">
                <td colspan="6" class="py-10 text-center text-ink-muted">
                  No orders match these filters.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <PaginationBar v-bind="query.data.value" @change="setPage" />
      </template>
    </div>
  </div>
</template>
