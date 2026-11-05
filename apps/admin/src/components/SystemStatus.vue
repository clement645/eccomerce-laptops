<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/lib/api';

const { data, isPending, isError } = useQuery({
  queryKey: ['health'],
  queryFn: () => api.health(),
  refetchInterval: 30_000,
});
</script>

<template>
  <section class="rounded-2xl bg-white p-5 shadow-card" aria-labelledby="system-status-title">
    <h2 id="system-status-title" class="text-sm font-semibold text-ink-muted">System status</h2>
    <p v-if="isPending" class="mt-3 text-sm text-ink-muted" role="status">Checking API…</p>
    <p
      v-else-if="isError"
      class="mt-3 flex items-center gap-2 font-medium text-red-600"
      role="status"
    >
      <span class="size-2 rounded-full bg-red-600" aria-hidden="true" />
      API unreachable
    </p>
    <template v-else-if="data">
      <p class="mt-3 flex items-center gap-2 font-medium" role="status">
        <span class="size-2 rounded-full bg-green-600" aria-hidden="true" />
        API {{ data.status }} · v{{ data.version }}
      </p>
      <dl class="mt-4 grid grid-cols-2 gap-2 text-sm">
        <template v-for="(state, name) in data.checks" :key="name">
          <dt class="capitalize text-ink-muted">{{ name }}</dt>
          <dd class="font-medium">{{ state.replace('_', ' ') }}</dd>
        </template>
      </dl>
    </template>
  </section>
</template>
