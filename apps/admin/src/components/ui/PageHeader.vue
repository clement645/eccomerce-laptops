<script setup lang="ts">
defineProps<{ title: string; description?: string }>();
</script>

<template>
  <div class="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 class="text-xl font-bold tracking-tight">{{ title }}</h2>
      <p v-if="description" class="mt-0.5 text-sm text-ink-muted">{{ description }}</p>
    </div>
    <div class="flex flex-wrap gap-2"><slot /></div>
  </div>
</template>
