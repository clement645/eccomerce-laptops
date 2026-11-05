<script setup lang="ts">
import { computed } from 'vue';
import { humanize } from '@/lib/format';

const props = defineProps<{ status: string | null | undefined }>();

const TONES: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  grey: 'bg-slate-100 text-slate-600 ring-slate-200',
};
const TONE_OF: Record<string, keyof typeof TONES> = {
  PAID: 'green',
  SUCCEEDED: 'green',
  DELIVERED: 'green',
  PUBLISHED: 'green',
  ACTIVE: 'green',
  IN_STOCK: 'green',
  PENDING: 'amber',
  UNPAID: 'amber',
  PROCESSING: 'blue',
  PACKED: 'blue',
  SHIPPED: 'blue',
  IN_TRANSIT: 'blue',
  DRAFT: 'grey',
  ARCHIVED: 'grey',
  REQUESTED: 'amber',
  LOW_STOCK: 'amber',
  PARTIALLY_REFUNDED: 'amber',
  FAILED: 'red',
  CANCELLED: 'red',
  SUSPENDED: 'red',
  OUT_OF_STOCK: 'red',
  REFUNDED: 'grey',
  REJECTED: 'grey',
  TIMED_OUT: 'red',
  INITIATED: 'grey',
};
const tone = computed(() => TONES[TONE_OF[props.status ?? ''] ?? 'grey']);
</script>

<template>
  <span
    :class="[
      'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
      tone,
    ]"
  >
    {{ humanize(status) }}
  </span>
</template>
