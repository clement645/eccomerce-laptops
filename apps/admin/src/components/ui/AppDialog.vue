<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';

/** Modal built on the native <dialog>: focus is trapped and Escape closes it. */
const props = defineProps<{ open: boolean; title: string; wide?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);

watch(
  () => props.open,
  (open) => {
    if (!dialog.value) return;
    if (open && !dialog.value.open) dialog.value.showModal();
    if (!open && dialog.value.open) dialog.value.close();
  },
  { flush: 'post' },
);
onBeforeUnmount(() => dialog.value?.close());
</script>

<template>
  <dialog
    ref="dialog"
    :class="[
      'm-auto w-[calc(100%-2rem)] rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-navy-950/50',
      wide ? 'max-w-3xl' : 'max-w-lg',
    ]"
    :aria-label="title"
    @close="emit('close')"
    @cancel.prevent="emit('close')"
  >
    <div v-if="open" class="flex max-h-[85dvh] flex-col">
      <header class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 class="text-lg font-bold">{{ title }}</h2>
        <button type="button" class="btn btn-ghost !p-2" aria-label="Close" @click="emit('close')">
          <X class="size-5" aria-hidden="true" />
        </button>
      </header>
      <div class="overflow-y-auto px-5 py-4"><slot /></div>
      <footer
        v-if="$slots.footer"
        class="flex justify-end gap-2 border-t border-slate-100 px-5 py-3"
      >
        <slot name="footer" />
      </footer>
    </div>
  </dialog>
</template>
