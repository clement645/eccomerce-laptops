<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { Search } from 'lucide-vue-next';
import type {
  InventoryMovementEntry,
  InventoryRow,
  Paginated,
  StockAdjustmentReason,
} from '@repo/shared-types';
import AppDialog from '@/components/ui/AppDialog.vue';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import PaginationBar from '@/components/ui/PaginationBar.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { useListQuery } from '@/composables/useListQuery';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { formatDateTime, humanize } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';

const api = useAdminApi();
const auth = useAuthStore();
const queryClient = useQueryClient();
const { filters, setPage, params } = useListQuery({ q: '', level: '' });
const list = useQuery({
  queryKey: ['admin-inventory', params],
  queryFn: () => api.get<Paginated<InventoryRow>>('/inventory', params.value),
  placeholderData: keepPreviousData,
});

const REASONS: { value: StockAdjustmentReason; label: string; hint: string }[] = [
  { value: 'RESTOCK', label: 'Restock', hint: 'New stock received' },
  { value: 'RETURN', label: 'Return', hint: 'Item returned in sellable condition' },
  { value: 'DAMAGE', label: 'Damaged or lost', hint: 'Removes stock' },
  { value: 'ADJUSTMENT', label: 'Correction', hint: 'Stock count correction (explain why)' },
];
const selected = ref<InventoryRow | null>(null);
const mode = ref<'adjust' | 'history' | null>(null);
const form = reactive({
  reason: 'RESTOCK' as StockAdjustmentReason,
  quantity: 1,
  note: '',
  lowStockThreshold: 5,
});
const error = ref('');
const fields = ref<Record<string, string>>({});
/** Damage removes stock; corrections can go either way (signed); restocks and returns add. */
const delta = computed(() =>
  form.reason === 'DAMAGE'
    ? -Math.abs(form.quantity)
    : form.reason === 'ADJUSTMENT'
      ? form.quantity
      : Math.abs(form.quantity),
);

function openAdjust(row: InventoryRow) {
  selected.value = row;
  Object.assign(form, {
    reason: 'RESTOCK',
    quantity: 1,
    note: '',
    lowStockThreshold: row.lowStockThreshold,
  });
  error.value = '';
  fields.value = {};
  mode.value = 'adjust';
}
const adjust = useMutation({
  mutationFn: () =>
    api.post<InventoryRow>(`/inventory/${selected.value!.variantId}/adjustments`, {
      reason: form.reason,
      delta: delta.value,
      note: form.note || undefined,
      lowStockThreshold: Number(form.lowStockThreshold),
    }),
  onSuccess: async () => {
    mode.value = null;
    await queryClient.invalidateQueries({ queryKey: ['admin-inventory'] });
  },
  onError: (e) => {
    error.value = errorMessage(e);
    fields.value = fieldErrors(e);
  },
});
const history = useQuery({
  queryKey: computed(() => ['admin-movements', selected.value?.variantId]),
  queryFn: () =>
    api.get<InventoryMovementEntry[]>(`/inventory/${selected.value!.variantId}/movements`),
  enabled: computed(() => mode.value === 'history' && Boolean(selected.value)),
});
</script>

<template>
  <div>
    <PageHeader
      title="Inventory"
      description="Lowest availability first. Available = on hand − reserved for unpaid orders."
    />
    <div class="card overflow-hidden">
      <form
        class="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_auto]"
        role="search"
        @submit.prevent
      >
        <label class="relative">
          <span class="sr-only">Search stock</span>
          <Search
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            v-model.lazy="filters.q"
            type="search"
            class="field-input !pl-9"
            placeholder="SKU or product name"
          />
        </label>
        <select v-model="filters.level" class="field-input" aria-label="Stock level">
          <option value="">All levels</option>
          <option value="OUT_OF_STOCK">Out of stock</option>
          <option value="LOW_STOCK">Low stock</option>
          <option value="IN_STOCK">In stock</option>
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
                <th>Product</th>
                <th>SKU</th>
                <th>On hand</th>
                <th>Reserved</th>
                <th>Available</th>
                <th>Level</th>
                <th class="sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in list.data.value.items"
                :key="row.variantId"
                :class="!row.isActive && 'opacity-60'"
              >
                <td>
                  <RouterLink
                    :to="{ name: 'product', params: { id: row.productId } }"
                    class="font-medium hover:text-brand-blue"
                    >{{ row.productName }}</RouterLink
                  >
                  <span class="block text-xs text-ink-muted"
                    >{{ row.variantName
                    }}<template v-if="!row.isActive"> · not on sale</template></span
                  >
                </td>
                <td class="font-mono text-xs">{{ row.sku }}</td>
                <td class="tabular-nums">{{ row.onHand }}</td>
                <td class="tabular-nums">{{ row.reserved }}</td>
                <td class="font-semibold tabular-nums">{{ row.available }}</td>
                <td><StatusBadge :status="row.level" /></td>
                <td class="whitespace-nowrap text-right">
                  <button
                    type="button"
                    class="btn btn-ghost !py-1"
                    @click="
                      selected = row;
                      mode = 'history';
                    "
                  >
                    History
                  </button>
                  <button
                    v-if="auth.can('inventory:adjust')"
                    type="button"
                    class="btn btn-secondary !py-1"
                    @click="openAdjust(row)"
                  >
                    Adjust
                  </button>
                </td>
              </tr>
              <tr v-if="!list.data.value.items.length">
                <td colspan="7" class="py-10 text-center text-ink-muted">Nothing matches.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <PaginationBar v-bind="list.data.value" @change="setPage" />
      </template>
    </div>

    <AppDialog
      :open="mode === 'adjust'"
      :title="`Adjust stock · ${selected?.sku ?? ''}`"
      @close="mode = null"
    >
      <form id="adjust-form" class="space-y-4" @submit.prevent="adjust.mutate()">
        <ErrorNotice :message="error" />
        <p class="text-sm text-ink-muted">
          {{ selected?.onHand }} on hand, {{ selected?.reserved }} reserved for unpaid orders.
        </p>
        <fieldset>
          <legend class="field-label">Reason</legend>
          <div class="grid gap-2 sm:grid-cols-2">
            <label
              v-for="r in REASONS"
              :key="r.value"
              :class="[
                'flex cursor-pointer flex-col rounded-xl border p-3 text-sm',
                form.reason === r.value ? 'border-brand-blue bg-indigo-50' : 'border-slate-200',
              ]"
            >
              <span class="flex items-center gap-2 font-semibold"
                ><input v-model="form.reason" type="radio" :value="r.value" /> {{ r.label }}</span
              >
              <span class="text-xs text-ink-muted">{{ r.hint }}</span>
            </label>
          </div>
        </fieldset>
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label for="qty" class="field-label">{{
              form.reason === 'ADJUSTMENT' ? 'Change (use − to remove)' : 'Units'
            }}</label>
            <input
              id="qty"
              v-model.number="form.quantity"
              type="number"
              :min="form.reason === 'ADJUSTMENT' ? undefined : 1"
              class="field-input"
              required
              :aria-invalid="!!fields.delta"
            />
            <p v-if="fields.delta" class="mt-1 text-xs text-red-700">{{ fields.delta }}</p>
          </div>
          <div>
            <label for="threshold" class="field-label">Low stock alert at</label>
            <input
              id="threshold"
              v-model.number="form.lowStockThreshold"
              type="number"
              min="0"
              class="field-input"
            />
          </div>
        </div>
        <div>
          <label for="adj-note" class="field-label"
            >Note {{ form.reason === 'ADJUSTMENT' ? '(required)' : '(optional)' }}</label
          >
          <input
            id="adj-note"
            v-model="form.note"
            class="field-input"
            maxlength="300"
            :aria-invalid="!!fields.note"
            placeholder="e.g. Delivery note DN-1042"
          />
          <p v-if="fields.note" class="mt-1 text-xs text-red-700">{{ fields.note }}</p>
        </div>
        <p class="text-sm">
          On hand after: <strong class="tabular-nums">{{ (selected?.onHand ?? 0) + delta }}</strong>
        </p>
      </form>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="mode = null">Cancel</button>
        <button
          type="submit"
          form="adjust-form"
          class="btn btn-primary"
          :disabled="adjust.isPending.value"
        >
          Save adjustment
        </button>
      </template>
    </AppDialog>

    <AppDialog
      :open="mode === 'history'"
      :title="`Stock history · ${selected?.sku ?? ''}`"
      wide
      @close="mode = null"
    >
      <LoadingState v-if="history.isPending.value" />
      <ErrorNotice v-else-if="history.isError.value" :message="errorMessage(history.error.value)" />
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Change</th>
            <th>Reason</th>
            <th>On hand</th>
            <th>By / order</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in history.data.value" :key="m.id">
            <td class="whitespace-nowrap text-xs">{{ formatDateTime(m.createdAt) }}</td>
            <td
              :class="[
                'tabular-nums font-semibold',
                m.delta > 0 ? 'text-emerald-700' : 'text-red-700',
              ]"
            >
              {{ m.delta > 0 ? '+' : '' }}{{ m.delta }}
            </td>
            <td>
              {{ humanize(m.reason)
              }}<span v-if="m.note" class="block text-xs text-ink-muted">{{ m.note }}</span>
            </td>
            <td class="tabular-nums">
              {{ m.onHandAfter }}
              <span class="text-xs text-ink-muted">({{ m.reservedAfter }} res.)</span>
            </td>
            <td class="text-xs">
              <RouterLink
                v-if="m.orderNumber"
                :to="{ name: 'order', params: { orderNumber: m.orderNumber } }"
                class="text-brand-blue hover:underline"
                >{{ m.orderNumber }}</RouterLink
              >
              <span v-else>{{ m.actor ?? 'System' }}</span>
            </td>
          </tr>
          <tr v-if="!history.data.value?.length">
            <td colspan="5" class="text-center text-ink-muted">No movements yet.</td>
          </tr>
        </tbody>
      </table>
    </AppDialog>
  </div>
</template>
