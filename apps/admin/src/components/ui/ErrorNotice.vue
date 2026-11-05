<script setup lang="ts">
defineProps<{ message: string | null | undefined }>();
</script>

<template>
  <p v-if="message" role="alert" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
    {{ message }}
  </p>
</template>
