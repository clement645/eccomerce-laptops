<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ArrowLeft, Ban, Banknote, PackageCheck, RotateCcw, Truck } from 'lucide-vue-next';
import type { AdminOrderDetail, AdminPayment, FulfillmentStatus } from '@repo/shared-types';
import AppDialog from '@/components/ui/AppDialog.vue';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { formatDateTime, formatKes, humanize, toMinor, toShillings } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const api = useAdminApi();
const auth = useAuthStore();
const queryClient = useQueryClient();
const orderNumber = computed(() => String(route.params.orderNumber));
const key = computed(() => ['admin-order', orderNumber.value]);

const query = useQuery({
  queryKey: key,
  queryFn: () => api.get<AdminOrderDetail>(`/orders/${encodeURIComponent(orderNumber.value)}`),
  refetchInterval: (q) => (q.state.data?.paymentStatus === 'PENDING' ? 5_000 : false),
});
const order = computed(() => query.data.value);

const actionError = ref('');
const fields = ref<Record<string, string>>({});
const dialog = ref<'ship' | 'cancel' | 'cash' | 'refund' | 'complete-refund' | null>(null);

function done(updated: AdminOrderDetail) {
  queryClient.setQueryData(key.value, updated);
  void queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  dialog.value = null;
  actionError.value = '';
  fields.value = {};
}
function failed(e: unknown) {
  actionError.value = errorMessage(e);
  fields.value = fieldErrors(e);
}

const path = (suffix = '') => `/orders/${encodeURIComponent(orderNumber.value)}${suffix}`;

const PROVIDER: Record<string, string> = {
  MPESA: 'M-Pesa',
  CASH_ON_DELIVERY: 'Cash on delivery',
  CARD: 'Card',
};

// ── Fulfilment ──────────────────────────────────────────────────────────────
const STEP_LABEL: Record<string, string> = {
  PROCESSING: 'Start processing',
  PACKED: 'Mark as packed',
  SHIPPED: 'Mark as shipped…',
  DELIVERED: 'Mark as delivered',
};
const transition = useMutation({
  mutationFn: (input: { to: FulfillmentStatus; shipment?: object }) =>
    api.post<AdminOrderDetail>(path('/transitions'), input),
  onSuccess: done,
  onError: failed,
});
const shipment = reactive({ carrier: '', trackingNumber: '', trackingUrl: '' });
function step(to: FulfillmentStatus) {
  actionError.value = '';
  if (to === 'SHIPPED') dialog.value = 'ship';
  else transition.mutate({ to });
}
function ship() {
  transition.mutate({
    to: 'SHIPPED',
    shipment: {
      carrier: shipment.carrier,
      trackingNumber: shipment.trackingNumber || null,
      trackingUrl: shipment.trackingUrl || null,
    },
  });
}

// ── Cancel ──────────────────────────────────────────────────────────────────
const cancelForm = reactive({ reason: '', restock: true });
const canCancel = computed(
  () =>
    auth.can('orders:cancel') &&
    ['PENDING', 'PROCESSING', 'PACKED'].includes(order.value?.fulfillmentStatus ?? ''),
);
const cancel = useMutation({
  mutationFn: () => api.post<AdminOrderDetail>(path('/cancel'), cancelForm),
  onSuccess: done,
  onError: failed,
});

// ── Cash on delivery ────────────────────────────────────────────────────────
const cashReference = ref('');
const cash = useMutation({
  mutationFn: () =>
    api.post<AdminOrderDetail>(path('/cash-payment'), { reference: cashReference.value }),
  onSuccess: done,
  onError: failed,
});

// ── Refunds ─────────────────────────────────────────────────────────────────
const refundTarget = ref<AdminPayment | null>(null);
const refundForm = reactive({ amount: '', reason: '' });
const completeTarget = ref<string | null>(null);
const refundReference = ref('');
const refreshOrder = () => queryClient.invalidateQueries({ queryKey: key.value });
const refundable = (p: AdminPayment) => {
  const open = p.refunds
    .filter((r) => ['REQUESTED', 'APPROVED', 'PROCESSING'].includes(r.status))
    .reduce((s, r) => s + r.amountMinor, 0);
  return Math.max(0, p.amountMinor - p.refundedMinor - open);
};
function openRefund(p: AdminPayment) {
  refundTarget.value = p;
  refundForm.amount = toShillings(refundable(p));
  refundForm.reason = '';
  dialog.value = 'refund';
}
const requestRefund = useMutation({
  mutationFn: () =>
    api.post(`/payments/${refundTarget.value!.id}/refunds`, {
      amountMinor: toMinor(refundForm.amount) ?? 0,
      reason: refundForm.reason,
    }),
  onSuccess: async () => {
    dialog.value = null;
    await refreshOrder();
  },
  onError: failed,
});
const completeRefund = useMutation({
  mutationFn: () =>
    api.post(`/refunds/${completeTarget.value}/complete`, {
      providerReference: refundReference.value,
    }),
  onSuccess: async () => {
    dialog.value = null;
    refundReference.value = '';
    await refreshOrder();
  },
  onError: failed,
});
const rejectRefund = useMutation({
  mutationFn: (id: string) => api.post(`/refunds/${id}/reject`),
  onSuccess: refreshOrder,
  onError: failed,
});

// ── Internal note ───────────────────────────────────────────────────────────
const note = ref('');
watch(order, (o) => (note.value = o?.internalNote ?? ''), { immediate: true });
const saveNote = useMutation({
  mutationFn: () => api.put<AdminOrderDetail>(path('/note'), { internalNote: note.value }),
  onSuccess: (o) => queryClient.setQueryData(key.value, o),
  onError: failed,
});

function closeDialog() {
  dialog.value = null;
  fields.value = {};
}
</script>

<template>
  <div>
    <RouterLink
      :to="{ name: 'orders' }"
      class="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
    >
      <ArrowLeft class="size-4" aria-hidden="true" /> All orders
    </RouterLink>
    <ErrorNotice v-if="query.isError.value" :message="errorMessage(query.error.value)" />
    <LoadingState v-else-if="!order" />
    <div v-else class="space-y-5">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="text-2xl font-bold tracking-tight">{{ order.orderNumber }}</h2>
          <p class="mt-1 text-sm text-ink-muted">Placed {{ formatDateTime(order.placedAt) }}</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <StatusBadge :status="order.paymentStatus" />
            <StatusBadge :status="order.fulfillmentStatus" />
            <span class="text-xs text-ink-muted self-center">
              {{ order.paymentProvider === 'CASH_ON_DELIVERY' ? 'Cash on delivery' : 'M-Pesa' }}
            </span>
          </div>
        </div>
        <div v-if="auth.can('orders:update') || canCancel" class="flex flex-wrap gap-2">
          <template v-if="auth.can('orders:update')">
            <button
              v-for="to in order.allowedTransitions"
              :key="to"
              type="button"
              class="btn btn-primary"
              :disabled="transition.isPending.value"
              @click="step(to)"
            >
              <component
                :is="to === 'SHIPPED' ? Truck : PackageCheck"
                class="size-4"
                aria-hidden="true"
              />
              {{ STEP_LABEL[to] }}
            </button>
            <button
              v-if="order.canRecordCashPayment"
              type="button"
              class="btn btn-secondary"
              @click="dialog = 'cash'"
            >
              <Banknote class="size-4" aria-hidden="true" /> Record cash payment
            </button>
          </template>
          <button
            v-if="canCancel"
            type="button"
            class="btn btn-secondary !text-red-700"
            @click="dialog = 'cancel'"
          >
            <Ban class="size-4" aria-hidden="true" /> Cancel order
          </button>
        </div>
      </div>
      <p
        v-if="order.paymentStatus === 'PENDING' && order.allowedTransitions.length === 0"
        class="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        Waiting for the customer's M-Pesa payment. Fulfilment unlocks once it is confirmed; this
        page refreshes by itself.
      </p>
      <ErrorNotice v-if="actionError && !dialog" :message="actionError" />

      <div class="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div class="min-w-0 space-y-5">
          <section class="card overflow-hidden">
            <h3 class="px-5 pt-5 font-semibold">Items</h3>
            <div class="mt-3 overflow-x-auto">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Price</th>
                    <th>Qty</th>
                    <th class="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="line in order.lines" :key="line.sku">
                    <td>
                      <span class="font-medium">{{ line.productName }}</span>
                      <span class="block text-xs text-ink-muted"
                        >{{ line.variantName }} · {{ line.sku }}</span
                      >
                    </td>
                    <td class="tabular-nums">{{ formatKes(line.unitPriceMinor) }}</td>
                    <td class="tabular-nums">{{ line.quantity }}</td>
                    <td class="text-right tabular-nums">{{ formatKes(line.lineTotalMinor) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <dl class="space-y-1 border-t border-slate-100 px-5 py-4 text-sm">
              <div class="flex justify-between">
                <dt class="text-ink-muted">Subtotal</dt>
                <dd class="tabular-nums">{{ formatKes(order.totals.subtotalMinor) }}</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-ink-muted">Delivery</dt>
                <dd class="tabular-nums">{{ formatKes(order.totals.shippingMinor) }}</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-ink-muted">VAT included</dt>
                <dd class="tabular-nums">{{ formatKes(order.totals.taxMinor, true) }}</dd>
              </div>
              <div class="flex justify-between text-base font-bold">
                <dt>Total</dt>
                <dd class="tabular-nums">{{ formatKes(order.totals.totalMinor) }}</dd>
              </div>
            </dl>
          </section>

          <section class="card p-5">
            <h3 class="font-semibold">Payments</h3>
            <p v-if="!order.payments.length" class="mt-2 text-sm text-ink-muted">
              No payment records.
            </p>
            <div
              v-for="p in order.payments"
              :key="p.id"
              class="mt-4 rounded-xl border border-slate-100 p-4"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="font-medium">
                  {{ PROVIDER[p.provider] ?? humanize(p.provider) }} ·
                  {{ formatKes(p.amountMinor) }}
                  <span v-if="p.providerReference" class="ml-1 font-mono text-xs text-ink-muted">{{
                    p.providerReference
                  }}</span>
                </p>
                <div class="flex items-center gap-2">
                  <StatusBadge :status="p.status" />
                  <button
                    v-if="
                      auth.can('orders:refund') &&
                      ['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(p.status) &&
                      refundable(p) > 0
                    "
                    type="button"
                    class="btn btn-secondary !py-1"
                    @click="openRefund(p)"
                  >
                    <RotateCcw class="size-3.5" aria-hidden="true" /> Refund
                  </button>
                </div>
              </div>
              <p v-if="!p.paidAt && p.status === 'SUCCEEDED'" class="mt-1 text-xs text-amber-800">
                Extra payment (duplicate or after cancellation). Refund it to the customer.
              </p>
              <ul v-if="p.attempts.length" class="mt-3 space-y-1 text-xs text-ink-muted">
                <li v-for="a in p.attempts" :key="a.id">
                  Prompt to {{ a.phoneMasked ?? '—' }} · {{ humanize(a.status) }} ·
                  {{ formatDateTime(a.createdAt) }}
                  <span v-if="a.resultDesc"> · {{ a.resultDesc }}</span>
                </li>
              </ul>
              <ul v-if="p.refunds.length" class="mt-3 space-y-2">
                <li
                  v-for="r in p.refunds"
                  :key="r.id"
                  class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                >
                  <span>
                    Refund {{ formatKes(r.amountMinor) }} · {{ r.reason }}
                    <span class="block text-xs text-ink-muted">
                      Requested {{ r.requestedBy ? `by ${r.requestedBy}` : 'automatically' }}
                      {{ formatDateTime(r.createdAt) }}
                      <template v-if="r.providerReference">
                        · sent ({{ r.providerReference }}) by {{ r.approvedBy }}</template
                      >
                    </span>
                  </span>
                  <span class="flex items-center gap-2">
                    <StatusBadge :status="r.status" />
                    <template v-if="auth.can('orders:refund') && r.status === 'REQUESTED'">
                      <button
                        type="button"
                        class="btn btn-secondary !py-1"
                        :disabled="r.requestedBy === auth.user?.email"
                        :title="
                          r.requestedBy === auth.user?.email
                            ? 'Another staff member must confirm a refund you requested'
                            : undefined
                        "
                        @click="
                          completeTarget = r.id;
                          dialog = 'complete-refund';
                        "
                      >
                        Record as sent
                      </button>
                      <button
                        type="button"
                        class="btn btn-ghost !py-1"
                        @click="rejectRefund.mutate(r.id)"
                      >
                        Reject
                      </button>
                    </template>
                  </span>
                </li>
              </ul>
            </div>
          </section>

          <section class="card p-5">
            <h3 class="font-semibold">History</h3>
            <ol class="mt-3 space-y-3 border-l-2 border-slate-100 pl-4 text-sm">
              <li v-for="(h, i) in order.history" :key="i" class="relative">
                <span
                  class="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-brand-blue"
                  aria-hidden="true"
                />
                <p class="font-medium">
                  {{ h.field === 'PAYMENT' ? 'Payment' : 'Fulfilment' }}: {{ humanize(h.toStatus) }}
                  <span
                    v-if="!h.isCustomerVisible"
                    class="ml-1 rounded bg-slate-100 px-1.5 text-xs text-ink-muted"
                    >staff only</span
                  >
                </p>
                <p v-if="h.note" class="text-ink-muted">{{ h.note }}</p>
                <p class="text-xs text-ink-muted">
                  {{ formatDateTime(h.at) }}<template v-if="h.actor"> · {{ h.actor }}</template>
                </p>
              </li>
            </ol>
          </section>
        </div>

        <aside class="min-w-0 space-y-5">
          <section class="card p-5 text-sm">
            <h3 class="font-semibold">Customer</h3>
            <p class="mt-2 font-medium">{{ order.customerName }}</p>
            <p>
              <a :href="`mailto:${order.email}`" class="text-brand-blue hover:underline">{{
                order.email
              }}</a>
            </p>
            <p>
              <a :href="`tel:+${order.phone}`" class="text-brand-blue hover:underline"
                >+{{ order.phone }}</a
              >
            </p>
            <RouterLink
              v-if="order.userId && auth.can('customers:read')"
              :to="{ name: 'customer', params: { id: order.userId } }"
              class="mt-2 inline-block text-xs font-semibold text-brand-blue hover:underline"
            >
              View customer
            </RouterLink>
            <p v-else-if="!order.userId" class="mt-2 text-xs text-ink-muted">Guest checkout</p>
            <p v-if="order.customerNote" class="mt-3 rounded-lg bg-amber-50 p-2 text-amber-900">
              “{{ order.customerNote }}”
            </p>
          </section>
          <section class="card p-5 text-sm">
            <h3 class="font-semibold">Delivery</h3>
            <p class="mt-2">{{ order.shippingAddress.recipientName }}</p>
            <p class="text-ink-muted">
              {{ order.shippingAddress.street
              }}<template v-if="order.shippingAddress.building"
                >, {{ order.shippingAddress.building }}</template
              ><br />
              {{ order.shippingAddress.town }}, {{ order.shippingAddress.county }}
              <template v-if="order.shippingAddress.landmark"
                ><br />Near {{ order.shippingAddress.landmark }}</template
              >
            </p>
            <p class="mt-2 text-ink-muted">{{ order.shippingMethodName }}</p>
            <div v-for="s in order.shipments" :key="s.id" class="mt-3 rounded-lg bg-slate-50 p-3">
              <p class="font-medium">
                {{ s.carrier }} <StatusBadge :status="s.status" class="ml-1" />
              </p>
              <p v-if="s.trackingNumber" class="font-mono text-xs">{{ s.trackingNumber }}</p>
              <a
                v-if="s.trackingUrl"
                :href="s.trackingUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-brand-blue hover:underline"
                >Tracking page</a
              >
            </div>
          </section>
          <section class="card p-5">
            <label for="internal-note" class="font-semibold">Internal note</label>
            <p class="text-xs text-ink-muted">Only staff see this.</p>
            <textarea
              id="internal-note"
              v-model="note"
              rows="4"
              maxlength="2000"
              class="field-input mt-2"
              :disabled="!auth.can('orders:update')"
            />
            <button
              v-if="auth.can('orders:update')"
              type="button"
              class="btn btn-secondary mt-2"
              :disabled="saveNote.isPending.value || note === (order.internalNote ?? '')"
              @click="saveNote.mutate()"
            >
              {{ saveNote.isPending.value ? 'Saving…' : 'Save note' }}
            </button>
          </section>
        </aside>
      </div>
    </div>

    <AppDialog :open="dialog === 'ship'" title="Ship order" @close="closeDialog">
      <form id="ship-form" class="space-y-4" @submit.prevent="ship">
        <ErrorNotice :message="actionError" />
        <div>
          <label for="carrier" class="field-label">Courier</label>
          <input
            id="carrier"
            v-model="shipment.carrier"
            class="field-input"
            required
            minlength="2"
            placeholder="e.g. G4S, Wells Fargo, store rider"
            :aria-invalid="!!fields['shipment.carrier']"
          />
        </div>
        <div>
          <label for="tracking" class="field-label">Tracking number (optional)</label>
          <input id="tracking" v-model="shipment.trackingNumber" class="field-input" />
        </div>
        <div>
          <label for="tracking-url" class="field-label">Tracking link (optional, https)</label>
          <input
            id="tracking-url"
            v-model="shipment.trackingUrl"
            type="url"
            class="field-input"
            placeholder="https://"
            :aria-invalid="!!fields['shipment.trackingUrl']"
          />
          <p v-if="fields['shipment.trackingUrl']" class="mt-1 text-xs text-red-700">
            {{ fields['shipment.trackingUrl'] }}
          </p>
        </div>
        <p class="text-xs text-ink-muted">
          The customer is emailed when you mark the order as shipped.
        </p>
      </form>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="closeDialog">Back</button>
        <button
          type="submit"
          form="ship-form"
          class="btn btn-primary"
          :disabled="transition.isPending.value"
        >
          Mark as shipped
        </button>
      </template>
    </AppDialog>

    <AppDialog :open="dialog === 'cancel'" title="Cancel order" @close="closeDialog">
      <form id="cancel-form" class="space-y-4" @submit.prevent="cancel.mutate()">
        <ErrorNotice :message="actionError" />
        <div>
          <label for="cancel-reason" class="field-label">Reason (shown to the customer)</label>
          <textarea
            id="cancel-reason"
            v-model="cancelForm.reason"
            rows="3"
            class="field-input"
            required
            minlength="3"
            maxlength="300"
          />
        </div>
        <label class="flex items-start gap-2 text-sm">
          <input v-model="cancelForm.restock" type="checkbox" class="mt-0.5 size-4" />
          <span
            >Put the items back on sale<span class="block text-xs text-ink-muted"
              >Untick if the items were lost or damaged.</span
            ></span
          >
        </label>
        <p
          v-if="order && ['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus)"
          class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          This order is paid. A refund for the amount not yet refunded is queued for confirmation.
        </p>
      </form>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="closeDialog">Keep order</button>
        <button
          type="submit"
          form="cancel-form"
          class="btn btn-danger"
          :disabled="cancel.isPending.value"
        >
          Cancel order
        </button>
      </template>
    </AppDialog>

    <AppDialog :open="dialog === 'cash'" title="Record cash payment" @close="closeDialog">
      <form id="cash-form" class="space-y-4" @submit.prevent="cash.mutate()">
        <ErrorNotice :message="actionError" />
        <p class="text-sm">
          Confirm that {{ formatKes(order?.totals.totalMinor) }} was collected on delivery.
        </p>
        <div>
          <label for="cash-ref" class="field-label">Receipt or delivery slip number</label>
          <input
            id="cash-ref"
            v-model="cashReference"
            class="field-input"
            required
            minlength="3"
            maxlength="40"
          />
        </div>
      </form>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="closeDialog">Back</button>
        <button
          type="submit"
          form="cash-form"
          class="btn btn-primary"
          :disabled="cash.isPending.value"
        >
          Record payment
        </button>
      </template>
    </AppDialog>

    <AppDialog :open="dialog === 'refund'" title="Request a refund" @close="closeDialog">
      <form id="refund-form" class="space-y-4" @submit.prevent="requestRefund.mutate()">
        <ErrorNotice :message="actionError" />
        <p class="text-sm text-ink-muted">
          Up to {{ formatKes(refundTarget ? refundable(refundTarget) : 0) }} can be refunded. A
          second staff member records the refund once the money has been sent.
        </p>
        <div>
          <label for="refund-amount" class="field-label">Amount (KES)</label>
          <input
            id="refund-amount"
            v-model="refundForm.amount"
            inputmode="decimal"
            class="field-input"
            required
          />
        </div>
        <div>
          <label for="refund-reason" class="field-label">Reason</label>
          <input
            id="refund-reason"
            v-model="refundForm.reason"
            class="field-input"
            required
            minlength="3"
            maxlength="500"
          />
        </div>
      </form>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="closeDialog">Back</button>
        <button
          type="submit"
          form="refund-form"
          class="btn btn-primary"
          :disabled="requestRefund.isPending.value"
        >
          Request refund
        </button>
      </template>
    </AppDialog>

    <AppDialog
      :open="dialog === 'complete-refund'"
      title="Record refund as sent"
      @close="closeDialog"
    >
      <form id="complete-form" class="space-y-4" @submit.prevent="completeRefund.mutate()">
        <ErrorNotice :message="actionError" />
        <p class="text-sm text-ink-muted">
          Only do this after the money has been sent back (for example an M-Pesa reversal).
        </p>
        <div>
          <label for="refund-ref" class="field-label">M-Pesa or bank reference</label>
          <input
            id="refund-ref"
            v-model="refundReference"
            class="field-input"
            required
            minlength="4"
            maxlength="40"
            pattern="[A-Za-z0-9-]+"
          />
        </div>
      </form>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="closeDialog">Back</button>
        <button
          type="submit"
          form="complete-form"
          class="btn btn-primary"
          :disabled="completeRefund.isPending.value"
        >
          Record as sent
        </button>
      </template>
    </AppDialog>
  </div>
</template>
