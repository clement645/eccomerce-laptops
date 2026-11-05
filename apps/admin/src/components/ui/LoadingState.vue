<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next';
defineProps<{ label?: string }>();
</script>

<template>
  <p role="status" class="flex items-center justify-center gap-2 py-12 text-sm text-ink-muted">
    <Loader2 class="size-5 animate-spin" aria-hidden="true" /> {{ label ?? 'Loading…' }}
  </p>
</template>
