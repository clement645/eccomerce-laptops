<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Clock,
  RotateCcw,
  Truck,
} from 'lucide-vue-next';
import type { DashboardRange, DashboardSummary } from '@repo/shared-types';
import RevenueChart from '@/components/RevenueChart.vue';
import SystemStatus from '@/components/SystemStatus.vue';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatKes } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';

const api = useAdminApi();
const auth = useAuthStore();
const range = ref<DashboardRange>('30d');
const RANGES: { value: DashboardRange; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];
const query = useQuery({
  queryKey: ['dashboard', range],
  queryFn: () => api.get<DashboardSummary>('/dashboard', { range: range.value }),
  refetchInterval: 60_000,
});

function change(current: number, previous: number): { text: string; up: boolean } | null {
  if (previous === 0) return current === 0 ? null : { text: 'new', up: true };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { text: `${Math.abs(pct)}%`, up: pct >= 0 };
}

const tiles = computed(() => {
  const d = query.data.value;
  if (!d) return [];
  return [
    {
      label: 'Revenue',
      value: formatKes(d.revenueMinor),
      change: change(d.revenueMinor, d.previousRevenueMinor),
    },
    {
      label: 'Paid orders',
      value: String(d.paidOrders),
      change: change(d.paidOrders, d.previousPaidOrders),
    },
    { label: 'Average order', value: formatKes(d.averageOrderMinor), change: null },
    { label: 'New customers', value: String(d.newCustomers), change: null },
  ];
});

const alerts = computed(() => {
  const d = query.data.value;
  if (!d) return [];
  return [
    {
      label: 'Ready to fulfil',
      value: d.toFulfil,
      icon: Truck,
      to: { name: 'orders' },
      show: auth.can('orders:read'),
    },
    {
      label: 'Awaiting payment',
      value: d.awaitingPayment,
      icon: Clock,
      to: { name: 'orders', query: { payment: 'PENDING' } },
      show: auth.can('orders:read'),
    },
    {
      label: 'Low stock',
      value: d.lowStock,
      icon: Boxes,
      to: { name: 'inventory', query: { level: 'LOW_STOCK' } },
      show: auth.can('inventory:read'),
    },
    {
      label: 'Out of stock',
      value: d.outOfStock,
      icon: AlertTriangle,
      to: { name: 'inventory', query: { level: 'OUT_OF_STOCK' } },
      show: auth.can('inventory:read'),
    },
    {
      label: 'Refunds to send',
      value: d.openRefunds,
      icon: RotateCcw,
      to: { name: 'orders' },
      show: auth.can('orders:read'),
    },
  ].filter((a) => a.show);
});
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-ink-muted">
        Figures come straight from the database. Revenue is money received, less refunds sent.
      </p>
      <div
        class="inline-flex rounded-full border border-slate-200 bg-white p-1"
        role="group"
        aria-label="Period"
      >
        <button
          v-for="r in RANGES"
          :key="r.value"
          type="button"
          :aria-pressed="range === r.value"
          :class="[
            'rounded-full px-3 py-1 text-sm font-medium',
            range === r.value ? 'bg-navy-950 text-white' : 'text-ink-muted hover:text-ink',
          ]"
          @click="range = r.value"
        >
          {{ r.label }}
        </button>
      </div>
    </div>

    <ErrorNotice v-if="query.isError.value" :message="errorMessage(query.error.value)" />
    <LoadingState v-else-if="query.isPending.value" label="Loading figures…" />
    <template v-else-if="query.data.value">
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <section v-for="tile in tiles" :key="tile.label" class="card p-5">
          <h3 class="text-sm font-medium text-ink-muted">{{ tile.label }}</h3>
          <p class="mt-2 text-2xl font-bold tabular-nums tracking-tight">{{ tile.value }}</p>
          <p
            v-if="tile.change"
            :class="[
              'mt-1 inline-flex items-center gap-1 text-xs font-semibold',
              tile.change.up ? 'text-emerald-700' : 'text-red-700',
            ]"
          >
            <component
              :is="tile.change.up ? ArrowUpRight : ArrowDownRight"
              class="size-3.5"
              aria-hidden="true"
            />
            {{ tile.change.text }} vs previous {{ range.replace('d', ' days') }}
          </p>
        </section>
      </div>

      <div class="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <section class="card p-5">
          <h3 class="font-semibold">Daily revenue</h3>
          <RevenueChart class="mt-4" :daily="query.data.value.daily" />
        </section>
        <section class="card p-5">
          <h3 class="font-semibold">Needs attention</h3>
          <ul class="mt-3 divide-y divide-slate-100">
            <li v-for="alert in alerts" :key="alert.label">
              <RouterLink
                :to="alert.to"
                class="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-brand-blue"
              >
                <span class="flex items-center gap-2">
                  <component :is="alert.icon" class="size-4 text-ink-muted" aria-hidden="true" />
                  {{ alert.label }}
                </span>
                <span
                  :class="[
                    'rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
                    alert.value ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-ink-muted',
                  ]"
                >
                  {{ alert.value }}
                </span>
              </RouterLink>
            </li>
          </ul>
        </section>
      </div>

      <div class="grid gap-4 xl:grid-cols-2">
        <section class="card overflow-hidden">
          <h3 class="px-5 pt-5 font-semibold">Recent orders</h3>
          <div class="mt-3 overflow-x-auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="o in query.data.value.recentOrders" :key="o.id">
                  <td>
                    <RouterLink
                      :to="{ name: 'order', params: { orderNumber: o.orderNumber } }"
                      class="whitespace-nowrap font-semibold text-brand-blue hover:underline"
                    >
                      {{ o.orderNumber }}
                    </RouterLink>
                    <span class="block text-xs text-ink-muted">{{
                      formatDateTime(o.placedAt)
                    }}</span>
                  </td>
                  <td>{{ o.customerName }}</td>
                  <td class="tabular-nums">{{ formatKes(o.totalMinor) }}</td>
                  <td class="space-x-1">
                    <StatusBadge :status="o.paymentStatus" />
                    <StatusBadge :status="o.fulfillmentStatus" />
                  </td>
                </tr>
                <tr v-if="!query.data.value.recentOrders.length">
                  <td colspan="4" class="text-center text-ink-muted">No orders yet.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <div class="space-y-4">
          <section class="card p-5">
            <h3 class="font-semibold">Best sellers this period</h3>
            <ol class="mt-3 space-y-2 text-sm">
              <li
                v-for="(p, i) in query.data.value.topProducts"
                :key="p.productId"
                class="flex items-center justify-between gap-3"
              >
                <span class="flex min-w-0 items-center gap-2">
                  <span
                    class="grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold"
                    >{{ i + 1 }}</span
                  >
                  <span class="truncate">{{ p.name }}</span>
                </span>
                <span class="shrink-0 text-ink-muted tabular-nums"
                  >{{ p.units }} sold · {{ formatKes(p.revenueMinor) }}</span
                >
              </li>
              <li v-if="!query.data.value.topProducts.length" class="text-ink-muted">
                No paid orders in this period.
              </li>
            </ol>
          </section>
          <SystemStatus />
        </div>
      </div>
    </template>
  </div>
</template>
