<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { Plus } from 'lucide-vue-next';
import type { AdminCoupon } from '@repo/shared-types';
import AppDialog from '@/components/ui/AppDialog.vue';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { formatDate, formatKes, toMinor, toShillings } from '@/lib/format';

const api = useAdminApi();
const queryClient = useQueryClient();
const list = useQuery({
  queryKey: ['admin-coupons'],
  queryFn: () => api.get<AdminCoupon[]>('/coupons'),
});

const toLocal = (iso: string | null) =>
  iso
    ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16)
    : '';
const blank = () => ({
  code: '',
  description: '',
  type: 'PERCENTAGE' as AdminCoupon['type'],
  percent: '',
  amount: '',
  maxDiscount: '',
  minOrder: '',
  startsAt: '',
  endsAt: '',
  maxRedemptions: '',
  maxPerCustomer: '',
  firstOrderOnly: false,
  isActive: true,
});
const form = reactive(blank());
const editing = ref<string | null>(null);
const open = ref(false);
const error = ref('');
const fields = ref<Record<string, string>>({});

function edit(c?: AdminCoupon) {
  Object.assign(form, blank());
  if (c)
    Object.assign(form, {
      code: c.code,
      description: c.description ?? '',
      type: c.type,
      percent: c.percentBps ? String(c.percentBps / 100) : '',
      amount: toShillings(c.amountMinor),
      maxDiscount: toShillings(c.maxDiscountMinor),
      minOrder: c.minOrderMinor ? toShillings(c.minOrderMinor) : '',
      startsAt: toLocal(c.startsAt),
      endsAt: toLocal(c.endsAt),
      maxRedemptions: c.maxRedemptions ? String(c.maxRedemptions) : '',
      maxPerCustomer: c.maxPerCustomer ? String(c.maxPerCustomer) : '',
      firstOrderOnly: c.firstOrderOnly,
      isActive: c.isActive,
    });
  editing.value = c?.id ?? null;
  error.value = '';
  fields.value = {};
  open.value = true;
}
const int = (v: string) => (v.trim() ? Number(v) : null);
const save = useMutation({
  mutationFn: () => {
    const body = {
      code: form.code,
      description: form.description || null,
      type: form.type,
      percentBps:
        form.type === 'PERCENTAGE' && form.percent ? Math.round(Number(form.percent) * 100) : null,
      amountMinor: form.type === 'FIXED_AMOUNT' ? toMinor(form.amount) : null,
      maxDiscountMinor: toMinor(form.maxDiscount),
      minOrderMinor: toMinor(form.minOrder) ?? 0,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      maxRedemptions: int(form.maxRedemptions),
      maxPerCustomer: int(form.maxPerCustomer),
      firstOrderOnly: form.firstOrderOnly,
      isActive: form.isActive,
    };
    return editing.value ? api.put(`/coupons/${editing.value}`, body) : api.post('/coupons', body);
  },
  onSuccess: async () => {
    open.value = false;
    await queryClient.invalidateQueries({ queryKey: ['admin-coupons'] });
  },
  onError: (e) => {
    error.value = errorMessage(e);
    fields.value = fieldErrors(e);
  },
});
const describe = (c: AdminCoupon) =>
  c.type === 'PERCENTAGE'
    ? `${(c.percentBps ?? 0) / 100}% off${c.maxDiscountMinor ? `, up to ${formatKes(c.maxDiscountMinor)}` : ''}`
    : `${formatKes(c.amountMinor)} off`;
const state = (c: AdminCoupon) => {
  const now = Date.now();
  if (!c.isActive) return 'Off';
  if (c.startsAt && Date.parse(c.startsAt) > now) return 'Scheduled';
  if (c.endsAt && Date.parse(c.endsAt) <= now) return 'Expired';
  if (c.maxRedemptions !== null && c.redemptionCount >= c.maxRedemptions) return 'Used up';
  return 'Live';
};
</script>

<template>
  <div>
    <PageHeader
      title="Coupons"
      description="Discounts apply to the price of items, not delivery. Customers enter the code at checkout."
    >
      <button type="button" class="btn btn-primary" @click="edit()">
        <Plus class="size-4" aria-hidden="true" /> New coupon
      </button>
    </PageHeader>
    <div class="card overflow-hidden">
      <ErrorNotice
        v-if="list.isError.value"
        class="m-4"
        :message="errorMessage(list.error.value)"
      />
      <LoadingState v-else-if="list.isPending.value" />
      <div v-else class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Discount</th>
              <th>Rules</th>
              <th>Used</th>
              <th>Status</th>
              <th class="sr-only">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in list.data.value" :key="c.id">
              <td>
                <span class="font-mono font-semibold">{{ c.code }}</span
                ><span v-if="c.description" class="block text-xs text-ink-muted">{{
                  c.description
                }}</span>
              </td>
              <td>{{ describe(c) }}</td>
              <td class="text-xs text-ink-muted">
                <span v-if="c.minOrderMinor" class="block"
                  >Min. {{ formatKes(c.minOrderMinor) }}</span
                >
                <span v-if="c.maxPerCustomer" class="block"
                  >{{ c.maxPerCustomer }} per customer</span
                >
                <span v-if="c.firstOrderOnly" class="block">First order only</span>
                <span v-if="c.startsAt || c.endsAt" class="block"
                  >{{ formatDate(c.startsAt) }} → {{ formatDate(c.endsAt) }}</span
                >
              </td>
              <td class="tabular-nums">
                {{ c.redemptionCount
                }}<template v-if="c.maxRedemptions"> / {{ c.maxRedemptions }}</template>
              </td>
              <td>
                <span
                  :class="[
                    'rounded-full px-2 py-0.5 text-xs font-semibold',
                    state(c) === 'Live'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-ink-muted',
                  ]"
                  >{{ state(c) }}</span
                >
              </td>
              <td class="text-right">
                <button type="button" class="btn btn-ghost !py-1" @click="edit(c)">Edit</button>
              </td>
            </tr>
            <tr v-if="!list.data.value?.length">
              <td colspan="6" class="py-10 text-center text-ink-muted">No coupons yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <AppDialog
      :open="open"
      :title="editing ? 'Edit coupon' : 'New coupon'"
      wide
      @close="open = false"
    >
      <form id="coupon-form" class="grid gap-4 md:grid-cols-2" @submit.prevent="save.mutate()">
        <ErrorNotice class="md:col-span-2" :message="error" />
        <div>
          <label for="c-code" class="field-label">Code</label>
          <input
            id="c-code"
            v-model="form.code"
            class="field-input font-mono uppercase"
            required
            :aria-invalid="!!fields.code"
          />
          <p v-if="fields.code" class="mt-1 text-xs text-red-700">{{ fields.code }}</p>
        </div>
        <div>
          <label for="c-desc" class="field-label">Description (shown at checkout)</label
          ><input id="c-desc" v-model="form.description" class="field-input" maxlength="200" />
        </div>
        <fieldset class="md:col-span-2">
          <legend class="field-label">Discount</legend>
          <div class="flex flex-wrap items-center gap-4 text-sm">
            <label class="flex items-center gap-2"
              ><input v-model="form.type" type="radio" value="PERCENTAGE" /> Percentage</label
            >
            <label class="flex items-center gap-2"
              ><input v-model="form.type" type="radio" value="FIXED_AMOUNT" /> Fixed amount</label
            >
          </div>
        </fieldset>
        <template v-if="form.type === 'PERCENTAGE'">
          <div>
            <label for="c-pct" class="field-label">Percent off</label>
            <input
              id="c-pct"
              v-model="form.percent"
              inputmode="decimal"
              class="field-input"
              placeholder="10"
              :aria-invalid="!!fields.percentBps"
            />
            <p v-if="fields.percentBps" class="mt-1 text-xs text-red-700">
              {{ fields.percentBps }}
            </p>
          </div>
          <div>
            <label for="c-cap" class="field-label">Maximum discount (KES, optional)</label
            ><input id="c-cap" v-model="form.maxDiscount" inputmode="decimal" class="field-input" />
          </div>
        </template>
        <div v-else>
          <label for="c-amt" class="field-label">Amount off (KES)</label>
          <input
            id="c-amt"
            v-model="form.amount"
            inputmode="decimal"
            class="field-input"
            :aria-invalid="!!fields.percentBps"
          />
          <p v-if="fields.percentBps" class="mt-1 text-xs text-red-700">{{ fields.percentBps }}</p>
        </div>
        <div>
          <label for="c-min" class="field-label">Minimum spend (KES, optional)</label
          ><input id="c-min" v-model="form.minOrder" inputmode="decimal" class="field-input" />
        </div>
        <div>
          <label for="c-start" class="field-label">Starts (optional)</label
          ><input id="c-start" v-model="form.startsAt" type="datetime-local" class="field-input" />
        </div>
        <div>
          <label for="c-end" class="field-label">Ends (optional)</label>
          <input
            id="c-end"
            v-model="form.endsAt"
            type="datetime-local"
            class="field-input"
            :aria-invalid="!!fields.endsAt"
          />
          <p v-if="fields.endsAt" class="mt-1 text-xs text-red-700">{{ fields.endsAt }}</p>
        </div>
        <div>
          <label for="c-total" class="field-label">Total uses (optional)</label
          ><input
            id="c-total"
            v-model="form.maxRedemptions"
            type="number"
            min="1"
            class="field-input"
          />
        </div>
        <div>
          <label for="c-per" class="field-label">Uses per customer (optional)</label
          ><input
            id="c-per"
            v-model="form.maxPerCustomer"
            type="number"
            min="1"
            class="field-input"
          />
        </div>
        <div class="flex flex-wrap gap-4 text-sm md:col-span-2">
          <label class="flex items-center gap-2"
            ><input v-model="form.firstOrderOnly" type="checkbox" /> First order only</label
          >
          <label class="flex items-center gap-2"
            ><input v-model="form.isActive" type="checkbox" /> Active</label
          >
        </div>
      </form>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="open = false">Cancel</button>
        <button
          type="submit"
          form="coupon-form"
          class="btn btn-primary"
          :disabled="save.isPending.value"
        >
          Save
        </button>
      </template>
    </AppDialog>
  </div>
</template>
