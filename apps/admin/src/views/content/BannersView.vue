<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ImageOff, Plus } from 'lucide-vue-next';
import type { AdminBanner, BannerPlacementValue, MediaUpload } from '@repo/shared-types';
import AppDialog from '@/components/ui/AppDialog.vue';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import ImageUploader from '@/components/ui/ImageUploader.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { formatDateTime, humanize } from '@/lib/format';

const api = useAdminApi();
const queryClient = useQueryClient();
const list = useQuery({
  queryKey: ['admin-banners'],
  queryFn: () => api.get<AdminBanner[]>('/banners'),
});
const PLACEMENTS: { value: BannerPlacementValue; label: string }[] = [
  { value: 'HERO', label: 'Homepage hero carousel' },
  { value: 'PROMO', label: 'Promotional banners' },
  { value: 'CATEGORY_STRIP', label: 'Category strip' },
];

/** datetime-local works in local time; the API stores ISO instants. */
const toLocal = (iso: string | null) =>
  iso
    ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16)
    : '';
const fromLocal = (value: string) => (value ? new Date(value).toISOString() : null);

const blank = () => ({
  placement: 'HERO' as BannerPlacementValue,
  eyebrow: '',
  title: '',
  titleHighlight: '',
  subtitle: '',
  highlights: '',
  annotation: '',
  ctaLabel: '',
  ctaHref: '',
  secondaryCtaLabel: '',
  secondaryCtaHref: '',
  imageKey: null as string | null,
  imageUrl: null as string | null,
  imageAlt: '',
  theme: 'dark',
  sortOrder: 0,
  startsAt: '',
  endsAt: '',
  isActive: true,
});
const form = reactive(blank());
const editing = ref<string | null>(null);
const open = ref(false);
const error = ref('');
const fields = ref<Record<string, string>>({});

function edit(b?: AdminBanner) {
  Object.assign(form, blank());
  if (b)
    Object.assign(form, {
      ...Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v ?? ''])),
      imageKey: b.imageKey,
      imageUrl: b.imageUrl,
      highlights: b.highlights.join(', '),
      startsAt: toLocal(b.startsAt),
      endsAt: toLocal(b.endsAt),
    });
  editing.value = b?.id ?? null;
  error.value = '';
  fields.value = {};
  open.value = true;
}
const nullable = (v: string) => (v.trim() ? v.trim() : null);
const save = useMutation({
  mutationFn: () => {
    const body = {
      placement: form.placement,
      eyebrow: nullable(form.eyebrow),
      title: form.title,
      titleHighlight: nullable(form.titleHighlight),
      subtitle: nullable(form.subtitle),
      highlights: form.highlights
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean),
      annotation: nullable(form.annotation),
      ctaLabel: nullable(form.ctaLabel),
      ctaHref: nullable(form.ctaHref),
      secondaryCtaLabel: nullable(form.secondaryCtaLabel),
      secondaryCtaHref: nullable(form.secondaryCtaHref),
      imageKey: form.imageKey,
      imageAlt: nullable(form.imageAlt),
      theme: form.theme,
      sortOrder: Number(form.sortOrder) || 0,
      startsAt: fromLocal(form.startsAt),
      endsAt: fromLocal(form.endsAt),
      isActive: form.isActive,
    };
    return editing.value ? api.put(`/banners/${editing.value}`, body) : api.post('/banners', body);
  },
  onSuccess: async () => {
    open.value = false;
    await queryClient.invalidateQueries({ queryKey: ['admin-banners'] });
  },
  onError: (e) => {
    error.value = errorMessage(e);
    fields.value = fieldErrors(e);
  },
});
const remove = useMutation({
  mutationFn: () => api.del(`/banners/${editing.value}`),
  onSuccess: async () => {
    open.value = false;
    await queryClient.invalidateQueries({ queryKey: ['admin-banners'] });
  },
  onError: (e) => (error.value = errorMessage(e)),
});
function setImage(m: MediaUpload) {
  form.imageKey = m.storageKey;
  form.imageUrl = m.url;
}
const live = (b: AdminBanner) => {
  const now = Date.now();
  return (
    b.isActive &&
    (!b.startsAt || Date.parse(b.startsAt) <= now) &&
    (!b.endsAt || Date.parse(b.endsAt) > now)
  );
};
</script>

<template>
  <div>
    <PageHeader
      title="Banners"
      description="Changes appear on the storefront within a few seconds."
    >
      <button type="button" class="btn btn-primary" @click="edit()">
        <Plus class="size-4" aria-hidden="true" /> New banner
      </button>
    </PageHeader>
    <ErrorNotice v-if="list.isError.value" :message="errorMessage(list.error.value)" />
    <LoadingState v-else-if="list.isPending.value" />
    <div v-else class="space-y-6">
      <section v-for="p in PLACEMENTS" :key="p.value">
        <h3 class="mb-2 text-sm font-semibold text-ink-muted">{{ p.label }}</h3>
        <ul class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <li v-for="b in list.data.value?.filter((x) => x.placement === p.value)" :key="b.id">
            <button
              type="button"
              class="card flex w-full gap-3 p-3 text-left hover:border-brand-blue"
              @click="edit(b)"
            >
              <img
                v-if="b.imageUrl"
                :src="b.imageUrl"
                :alt="b.imageAlt ?? ''"
                class="size-20 rounded-lg bg-slate-50 object-cover"
              />
              <span
                v-else
                class="grid size-20 place-items-center rounded-lg bg-slate-100 text-ink-muted"
                ><ImageOff class="size-5" aria-hidden="true"
              /></span>
              <span class="min-w-0">
                <span class="block truncate font-semibold"
                  >{{ b.title }} <span class="text-brand-purple">{{ b.titleHighlight }}</span></span
                >
                <span class="block truncate text-xs text-ink-muted">{{ b.subtitle }}</span>
                <span
                  :class="[
                    'mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold',
                    live(b) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-ink-muted',
                  ]"
                >
                  {{ live(b) ? 'Live' : b.isActive ? 'Scheduled / ended' : 'Off' }}
                </span>
                <span v-if="b.startsAt || b.endsAt" class="block text-xs text-ink-muted"
                  >{{ formatDateTime(b.startsAt) }} → {{ formatDateTime(b.endsAt) }}</span
                >
              </span>
            </button>
          </li>
          <li
            v-if="!list.data.value?.some((x) => x.placement === p.value)"
            class="text-sm text-ink-muted"
          >
            None.
          </li>
        </ul>
      </section>
    </div>

    <AppDialog
      :open="open"
      :title="editing ? 'Edit banner' : 'New banner'"
      wide
      @close="open = false"
    >
      <form id="banner-form" class="grid gap-4 md:grid-cols-2" @submit.prevent="save.mutate()">
        <ErrorNotice class="md:col-span-2" :message="error" />
        <div>
          <label for="placement" class="field-label">Placement</label>
          <select id="placement" v-model="form.placement" class="field-input">
            <option v-for="p in PLACEMENTS" :key="p.value" :value="p.value">{{ p.label }}</option>
          </select>
        </div>
        <div>
          <label for="theme" class="field-label">Style</label>
          <select id="theme" v-model="form.theme" class="field-input">
            <option v-for="t in ['dark', 'light', 'gradient']" :key="t" :value="t">
              {{ humanize(t) }}
            </option>
          </select>
        </div>
        <div>
          <label for="eyebrow" class="field-label">Small heading</label
          ><input id="eyebrow" v-model="form.eyebrow" class="field-input" maxlength="60" />
        </div>
        <div>
          <label for="title" class="field-label">Title</label
          ><input
            id="title"
            v-model="form.title"
            class="field-input"
            required
            :aria-invalid="!!fields.title"
          />
        </div>
        <div>
          <label for="highlight" class="field-label">Highlighted words</label
          ><input
            id="highlight"
            v-model="form.titleHighlight"
            class="field-input"
            maxlength="60"
            placeholder="Shown in the brand gradient"
          />
        </div>
        <div>
          <label for="annotation" class="field-label">Handwritten note</label
          ><input id="annotation" v-model="form.annotation" class="field-input" maxlength="80" />
        </div>
        <div class="md:col-span-2">
          <label for="subtitle" class="field-label">Subtitle</label
          ><textarea
            id="subtitle"
            v-model="form.subtitle"
            rows="2"
            class="field-input"
            maxlength="300"
          />
        </div>
        <div class="md:col-span-2">
          <label for="pills" class="field-label">Feature pills (comma-separated, up to 6)</label
          ><input
            id="pills"
            v-model="form.highlights"
            class="field-input"
            placeholder="Top brands, Genuine products, Free delivery"
          />
        </div>
        <div>
          <label for="cta" class="field-label">Button label</label
          ><input id="cta" v-model="form.ctaLabel" class="field-input" maxlength="40" />
        </div>
        <div>
          <label for="cta-href" class="field-label">Button link</label>
          <input
            id="cta-href"
            v-model="form.ctaHref"
            class="field-input"
            placeholder="/shop or https://…"
            :aria-invalid="!!fields.ctaHref"
          />
          <p v-if="fields.ctaHref" class="mt-1 text-xs text-red-700">{{ fields.ctaHref }}</p>
        </div>
        <div>
          <label for="cta2" class="field-label">Second button label</label
          ><input id="cta2" v-model="form.secondaryCtaLabel" class="field-input" maxlength="40" />
        </div>
        <div>
          <label for="cta2-href" class="field-label">Second button link</label>
          <input
            id="cta2-href"
            v-model="form.secondaryCtaHref"
            class="field-input"
            :aria-invalid="!!fields.secondaryCtaHref"
          />
          <p v-if="fields.secondaryCtaHref" class="mt-1 text-xs text-red-700">
            {{ fields.secondaryCtaHref }}
          </p>
        </div>
        <div class="md:col-span-2 flex items-center gap-3">
          <img
            v-if="form.imageUrl"
            :src="form.imageUrl"
            alt=""
            class="size-20 rounded-lg bg-slate-50 object-cover"
          />
          <ImageUploader
            class="flex-1"
            folder="banners"
            label="Upload banner image"
            @uploaded="setImage"
          />
        </div>
        <div class="md:col-span-2">
          <label for="alt" class="field-label">Image description</label>
          <input
            id="alt"
            v-model="form.imageAlt"
            class="field-input"
            maxlength="200"
            :aria-invalid="!!fields.imageAlt"
          />
          <p v-if="fields.imageAlt" class="mt-1 text-xs text-red-700">{{ fields.imageAlt }}</p>
        </div>
        <div>
          <label for="starts" class="field-label">Show from (optional)</label
          ><input id="starts" v-model="form.startsAt" type="datetime-local" class="field-input" />
        </div>
        <div>
          <label for="ends" class="field-label">Show until (optional)</label>
          <input
            id="ends"
            v-model="form.endsAt"
            type="datetime-local"
            class="field-input"
            :aria-invalid="!!fields.endsAt"
          />
          <p v-if="fields.endsAt" class="mt-1 text-xs text-red-700">{{ fields.endsAt }}</p>
        </div>
        <div class="flex items-center gap-4 text-sm md:col-span-2">
          <label class="flex items-center gap-2"
            ><input v-model="form.isActive" type="checkbox" /> Active</label
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
          form="banner-form"
          class="btn btn-primary"
          :disabled="save.isPending.value"
        >
          Save
        </button>
      </template>
    </AppDialog>
  </div>
</template>
