<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ArrowLeft } from 'lucide-vue-next';
import type { AdminCustomerDetail } from '@repo/shared-types';
import AppDialog from '@/components/ui/AppDialog.vue';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime, formatKes } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const api = useAdminApi();
const auth = useAuthStore();
const queryClient = useQueryClient();
const id = computed(() => String(route.params.id));
const key = computed(() => ['admin-customer', id.value]);
const query = useQuery({
  queryKey: key,
  queryFn: () => api.get<AdminCustomerDetail>(`/customers/${id.value}`),
});
const customer = computed(() => query.data.value);

const open = ref(false);
const reason = ref('');
const error = ref('');
const nextStatus = computed(() =>
  customer.value?.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
);
const setStatus = useMutation({
  mutationFn: () =>
    api.post<AdminCustomerDetail>(`/customers/${id.value}/status`, {
      status: nextStatus.value,
      reason: reason.value,
    }),
  onSuccess: (c) => {
    queryClient.setQueryData(key.value, c);
    void queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
    open.value = false;
    reason.value = '';
  },
  onError: (e) => (error.value = errorMessage(e)),
});
</script>

<template>
  <div>
    <RouterLink
      :to="{ name: 'customers' }"
      class="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
    >
      <ArrowLeft class="size-4" aria-hidden="true" /> All customers
    </RouterLink>
    <ErrorNotice v-if="query.isError.value" :message="errorMessage(query.error.value)" />
    <LoadingState v-else-if="!customer" />
    <div v-else class="space-y-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-2xl font-bold tracking-tight">{{ customer.name }}</h2>
          <p class="text-sm text-ink-muted">
            {{ customer.email }} · joined {{ formatDate(customer.createdAt) }}
          </p>
          <div class="mt-2 flex gap-2"><StatusBadge :status="customer.status" /></div>
        </div>
        <button
          v-if="auth.can('customers:manage')"
          type="button"
          :class="[
            'btn',
            customer.status === 'SUSPENDED' ? 'btn-secondary' : 'btn-secondary !text-red-700',
          ]"
          @click="
            open = true;
            error = '';
          "
        >
          {{ customer.status === 'SUSPENDED' ? 'Reactivate account' : 'Suspend account' }}
        </button>
      </div>
      <div class="grid gap-4 sm:grid-cols-3">
        <section class="card p-5">
          <h3 class="text-sm text-ink-muted">Orders</h3>
          <p class="mt-1 text-2xl font-bold tabular-nums">{{ customer.orderCount }}</p>
        </section>
        <section class="card p-5">
          <h3 class="text-sm text-ink-muted">Spent (paid orders)</h3>
          <p class="mt-1 text-2xl font-bold tabular-nums">
            {{ formatKes(customer.totalSpentMinor) }}
          </p>
        </section>
        <section class="card p-5">
          <h3 class="text-sm text-ink-muted">Last order</h3>
          <p class="mt-1 text-lg font-semibold">{{ formatDate(customer.lastOrderAt) }}</p>
        </section>
      </div>
      <div class="grid gap-5 xl:grid-cols-[1fr_20rem]">
        <section class="card overflow-hidden">
          <h3 class="px-5 pt-5 font-semibold">Orders</h3>
          <table class="data-table mt-3">
            <thead>
              <tr>
                <th>Order</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Fulfilment</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in customer.orders" :key="o.id">
                <td>
                  <RouterLink
                    :to="{ name: 'order', params: { orderNumber: o.orderNumber } }"
                    class="whitespace-nowrap font-semibold text-brand-blue hover:underline"
                    >{{ o.orderNumber }}</RouterLink
                  >
                  <span class="block text-xs text-ink-muted">{{ formatDateTime(o.placedAt) }}</span>
                </td>
                <td class="tabular-nums">{{ formatKes(o.totalMinor) }}</td>
                <td><StatusBadge :status="o.paymentStatus" /></td>
                <td><StatusBadge :status="o.fulfillmentStatus" /></td>
              </tr>
              <tr v-if="!customer.orders.length">
                <td colspan="4" class="py-8 text-center text-ink-muted">No orders yet.</td>
              </tr>
            </tbody>
          </table>
        </section>
        <aside class="space-y-5">
          <section class="card p-5 text-sm">
            <h3 class="font-semibold">Contact</h3>
            <p class="mt-2">
              <a :href="`mailto:${customer.email}`" class="text-brand-blue hover:underline">{{
                customer.email
              }}</a>
            </p>
            <p v-if="customer.phone">
              <a :href="`tel:+${customer.phone}`" class="text-brand-blue hover:underline"
                >+{{ customer.phone }}</a
              >
            </p>
            <p class="mt-2 text-ink-muted">
              Marketing emails: {{ customer.marketingOptIn ? 'yes' : 'no' }}
            </p>
          </section>
          <section class="card p-5 text-sm">
            <h3 class="font-semibold">Addresses</h3>
            <ul class="mt-2 space-y-3">
              <li v-for="a in customer.addresses" :key="a.id">
                <p class="font-medium">
                  {{ a.label ?? a.recipientName }}
                  <span v-if="a.isDefault" class="text-xs text-ink-muted">(default)</span>
                </p>
                <p class="text-ink-muted">{{ a.street }}, {{ a.town }}, {{ a.county }}</p>
              </li>
              <li v-if="!customer.addresses.length" class="text-ink-muted">None saved.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>

    <AppDialog
      :open="open"
      :title="nextStatus === 'SUSPENDED' ? 'Suspend account' : 'Reactivate account'"
      @close="open = false"
    >
      <form id="status-form" class="space-y-4" @submit.prevent="setStatus.mutate()">
        <ErrorNotice :message="error" />
        <p v-if="nextStatus === 'SUSPENDED'" class="text-sm">
          The customer is signed out everywhere and cannot sign in until reactivated. Their orders
          are not affected.
        </p>
        <div>
          <label for="status-reason" class="field-label">Reason (kept in the audit log)</label>
          <input
            id="status-reason"
            v-model="reason"
            class="field-input"
            required
            minlength="3"
            maxlength="300"
          />
        </div>
      </form>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="open = false">Cancel</button>
        <button
          type="submit"
          form="status-form"
          :class="['btn', nextStatus === 'SUSPENDED' ? 'btn-danger' : 'btn-primary']"
          :disabled="setStatus.isPending.value"
        >
          {{ nextStatus === 'SUSPENDED' ? 'Suspend' : 'Reactivate' }}
        </button>
      </template>
    </AppDialog>
  </div>
</template>
