<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ page: number; pageSize: number; total: number }>();
const emit = defineEmits<{ change: [page: number] }>();
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
const first = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1));
const last = computed(() => Math.min(props.total, props.page * props.pageSize));
</script>

<template>
  <nav
    class="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm"
    aria-label="Pagination"
  >
    <p class="text-ink-muted">{{ first }}–{{ last }} of {{ total }}</p>
    <div class="flex gap-2">
      <button
        type="button"
        class="btn btn-secondary !py-1.5"
        :disabled="page <= 1"
        @click="emit('change', page - 1)"
      >
        Previous
      </button>
      <button
        type="button"
        class="btn btn-secondary !py-1.5"
        :disabled="page >= pages"
        @click="emit('change', page + 1)"
      >
        Next
      </button>
    </div>
  </nav>
</template>
