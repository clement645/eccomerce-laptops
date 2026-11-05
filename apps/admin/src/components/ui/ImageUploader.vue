<script setup lang="ts">
import { ref } from 'vue';
import { ImagePlus, Loader2 } from 'lucide-vue-next';
import type { MediaUpload } from '@repo/shared-types';
import { useAdminApi } from '@/composables/useAdminApi';
import { errorMessage } from '@/lib/errors';

/** Picks one or more images and uploads each to object storage through the API. */
const props = defineProps<{
  folder: 'products' | 'categories' | 'brands' | 'banners' | 'blog';
  multiple?: boolean;
  label?: string;
}>();
const emit = defineEmits<{ uploaded: [media: MediaUpload] }>();
const api = useAdminApi();
const busy = ref(false);
const error = ref('');
const input = ref<HTMLInputElement | null>(null);
const MAX = 8 * 1024 * 1024;

async function onChange(event: Event) {
  const files = [...((event.target as HTMLInputElement).files ?? [])];
  error.value = '';
  busy.value = true;
  try {
    for (const file of files) {
      if (file.size > MAX) {
        error.value = `${file.name} is larger than 8 MB.`;
        continue;
      }
      emit('uploaded', await api.upload<MediaUpload>(file, props.folder));
    }
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
    if (input.value) input.value.value = '';
  }
}
</script>

<template>
  <div>
    <label
      class="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-5 text-sm font-medium text-ink-muted transition hover:border-brand-blue hover:text-brand-blue focus-within:border-brand-blue"
    >
      <Loader2 v-if="busy" class="size-5 animate-spin" aria-hidden="true" />
      <ImagePlus v-else class="size-5" aria-hidden="true" />
      {{ busy ? 'Uploading…' : (label ?? 'Upload image (JPEG, PNG, WebP, up to 8 MB)') }}
      <input
        ref="input"
        type="file"
        class="sr-only"
        accept="image/jpeg,image/png,image/webp,image/avif"
        :multiple="multiple"
        :disabled="busy"
        @change="onChange"
      />
    </label>
    <p v-if="error" role="alert" class="mt-2 text-sm text-red-700">{{ error }}</p>
  </div>
</template>
