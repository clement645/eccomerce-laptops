<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ImageOff, Plus } from 'lucide-vue-next';
import type { AdminBrand, MediaUpload } from '@repo/shared-types';
import AppDialog from '@/components/ui/AppDialog.vue';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import ImageUploader from '@/components/ui/ImageUploader.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { slugify } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';

const api = useAdminApi();
const auth = useAuthStore();
const queryClient = useQueryClient();
const list = useQuery({
  queryKey: ['admin-brands'],
  queryFn: () => api.get<AdminBrand[]>('/brands'),
});

const blank = () => ({
  name: '',
  slug: '',
  description: '',
  website: '',
  logoKey: null as string | null,
  logoUrl: null as string | null,
  isVisible: true,
  isFeatured: false,
  sortOrder: 0,
});
const form = reactive(blank());
const editing = ref<string | null>(null);
const open = ref(false);
const slugTouched = ref(false);
const error = ref('');
const fields = ref<Record<string, string>>({});
watch(
  () => form.name,
  (n) => {
    if (!slugTouched.value) form.slug = slugify(n);
  },
);

function edit(b?: AdminBrand) {
  Object.assign(
    form,
    blank(),
    b ? { ...b, description: b.description ?? '', website: b.website ?? '' } : {},
  );
  editing.value = b?.id ?? null;
  slugTouched.value = Boolean(b);
  error.value = '';
  fields.value = {};
  open.value = true;
}
const save = useMutation({
  mutationFn: () => {
    const body = {
      name: form.name,
      slug: form.slug,
      description: form.description || null,
      website: form.website || null,
      logoKey: form.logoKey,
      isVisible: form.isVisible,
      isFeatured: form.isFeatured,
      sortOrder: Number(form.sortOrder) || 0,
    };
    return editing.value ? api.put(`/brands/${editing.value}`, body) : api.post('/brands', body);
  },
  onSuccess: async () => {
    open.value = false;
    await queryClient.invalidateQueries({ queryKey: ['admin-brands'] });
  },
  onError: (e) => {
    error.value = errorMessage(e);
    fields.value = fieldErrors(e);
  },
});
const remove = useMutation({
  mutationFn: () => api.del(`/brands/${editing.value}`),
  onSuccess: async () => {
    open.value = false;
    await queryClient.invalidateQueries({ queryKey: ['admin-brands'] });
  },
  onError: (e) => (error.value = errorMessage(e)),
});
function setLogo(m: MediaUpload) {
  form.logoKey = m.storageKey;
  form.logoUrl = m.url;
}
</script>

<template>
  <div>
    <PageHeader title="Brands" description="Featured brands appear in the homepage brand strip.">
      <button v-if="auth.can('brands:write')" type="button" class="btn btn-primary" @click="edit()">
        <Plus class="size-4" aria-hidden="true" /> New brand
      </button>
    </PageHeader>
    <div class="card overflow-hidden">
      <ErrorNotice
        v-if="list.isError.value"
        class="m-4"
        :message="errorMessage(list.error.value)"
      />
      <LoadingState v-else-if="list.isPending.value" />
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Brand</th>
            <th>Products</th>
            <th>Visible</th>
            <th>Featured</th>
            <th class="sr-only">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in list.data.value" :key="b.id">
            <td>
              <span class="flex items-center gap-3 font-medium">
                <img v-if="b.logoUrl" :src="b.logoUrl" alt="" class="h-8 w-14 object-contain" />
                <span
                  v-else
                  class="grid h-8 w-14 place-items-center rounded bg-slate-100 text-ink-muted"
                  ><ImageOff class="size-4" aria-hidden="true"
                /></span>
                {{ b.name }}
              </span>
            </td>
            <td class="tabular-nums">{{ b.productCount }}</td>
            <td>{{ b.isVisible ? 'Yes' : 'Hidden' }}</td>
            <td>{{ b.isFeatured ? 'Yes' : '—' }}</td>
            <td class="text-right">
              <button
                v-if="auth.can('brands:write')"
                type="button"
                class="btn btn-ghost !py-1"
                @click="edit(b)"
              >
                Edit
              </button>
            </td>
          </tr>
          <tr v-if="!list.data.value?.length">
            <td colspan="5" class="py-10 text-center text-ink-muted">No brands yet.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <AppDialog :open="open" :title="editing ? 'Edit brand' : 'New brand'" @close="open = false">
      <form id="brand-form" class="space-y-4" @submit.prevent="save.mutate()">
        <ErrorNotice :message="error" />
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label for="b-name" class="field-label">Name</label>
            <input
              id="b-name"
              v-model="form.name"
              class="field-input"
              required
              :aria-invalid="!!fields.name"
            />
            <p v-if="fields.name" class="mt-1 text-xs text-red-700">{{ fields.name }}</p>
          </div>
          <div>
            <label for="b-slug" class="field-label">URL slug</label>
            <input
              id="b-slug"
              v-model="form.slug"
              class="field-input font-mono"
              required
              @input="slugTouched = true"
            />
          </div>
        </div>
        <div>
          <label for="b-site" class="field-label">Website (https, optional)</label>
          <input
            id="b-site"
            v-model="form.website"
            type="url"
            class="field-input"
            placeholder="https://"
            :aria-invalid="!!fields.website"
          />
          <p v-if="fields.website" class="mt-1 text-xs text-red-700">{{ fields.website }}</p>
        </div>
        <div>
          <label for="b-desc" class="field-label">Description</label>
          <textarea
            id="b-desc"
            v-model="form.description"
            rows="2"
            class="field-input"
            maxlength="500"
          />
        </div>
        <div class="flex items-center gap-3">
          <img
            v-if="form.logoUrl"
            :src="form.logoUrl"
            alt=""
            class="h-12 w-20 rounded border border-slate-100 object-contain"
          />
          <ImageUploader class="flex-1" folder="brands" label="Upload logo" @uploaded="setLogo" />
        </div>
        <div class="flex flex-wrap gap-4 text-sm">
          <label class="flex items-center gap-2"
            ><input v-model="form.isVisible" type="checkbox" /> Visible</label
          >
          <label class="flex items-center gap-2"
            ><input v-model="form.isFeatured" type="checkbox" /> Featured</label
          >
          <label class="flex items-center gap-2"
            >Order
            <input
              v-model.number="form.sortOrder"
              type="number"
              min="0"
              class="field-input !w-20 !py-1"
          /></label>
        </div>
      </form>
      <template #footer>
        <button
          v-if="editing"
          type="button"
          class="btn btn-ghost mr-auto !text-red-700"
          :disabled="remove.isPending.value"
          @click="remove.mutate()"
        >
          Delete
        </button>
        <button type="button" class="btn btn-secondary" @click="open = false">Cancel</button>
        <button
          type="submit"
          form="brand-form"
          class="btn btn-primary"
          :disabled="save.isPending.value"
        >
          Save
        </button>
      </template>
    </AppDialog>
  </div>
</template>
