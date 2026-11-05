<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, Plus, Trash2 } from 'lucide-vue-next';
import type {
  AdminBrand,
  AdminCategory,
  AdminProduct,
  MediaUpload,
  ProductStatusValue,
} from '@repo/shared-types';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import ImageUploader from '@/components/ui/ImageUploader.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { env } from '@/lib/env';
import { slugify, toMinor, toShillings } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';

interface VariantRow {
  id?: string;
  sku: string;
  name: string;
  price: string;
  compareAt: string;
  cost: string;
  attributes: string;
  isDefault: boolean;
  isActive: boolean;
  lowStockThreshold: number;
  initialStock: number;
  onHand?: number;
  reserved?: number;
}
interface ImageRow {
  storageKey: string;
  url: string | null;
  alt: string;
}

const route = useRoute();
const router = useRouter();
const api = useAdminApi();
const auth = useAuthStore();
const queryClient = useQueryClient();
const id = computed(() => (route.name === 'product' ? String(route.params.id) : null));
const canEdit = computed(() => auth.can('products:write'));

const categories = useQuery({
  queryKey: ['admin-categories'],
  queryFn: () => api.get<AdminCategory[]>('/categories'),
});
const brands = useQuery({
  queryKey: ['admin-brands'],
  queryFn: () => api.get<AdminBrand[]>('/brands'),
});
const product = useQuery({
  queryKey: computed(() => ['admin-product', id.value]),
  queryFn: () => api.get<AdminProduct>(`/products/${id.value}`),
  enabled: computed(() => id.value !== null),
});

const emptyVariant = (isDefault = false): VariantRow => ({
  sku: '',
  name: '',
  price: '',
  compareAt: '',
  cost: '',
  attributes: '',
  isDefault,
  isActive: true,
  lowStockThreshold: 5,
  initialStock: 0,
});
const form = reactive({
  name: '',
  slug: '',
  brandId: '',
  categoryId: '',
  condition: 'NEW' as 'NEW' | 'REFURBISHED',
  shortDescription: '',
  description: '',
  warrantyMonths: 12,
  warrantyText: '',
  isFeatured: false,
  seoTitle: '',
  seoDescription: '',
  variants: [emptyVariant(true)] as VariantRow[],
  specifications: [] as { group: string; key: string; value: string; isFilterable: boolean }[],
  images: [] as ImageRow[],
});
const slugTouched = ref(false);
watch(
  () => form.name,
  (name) => {
    if (!slugTouched.value && !id.value) form.slug = slugify(name);
  },
);

/** "RAM: 16GB, Storage: 512GB" ⇄ { RAM: '16GB', Storage: '512GB' } */
const attributesToText = (a: Record<string, string>) =>
  Object.entries(a)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
const textToAttributes = (text: string) =>
  Object.fromEntries(
    text
      .split(',')
      .map((pair) => pair.split(':').map((s) => s.trim()))
      .filter((parts) => parts.length === 2 && parts[0] && parts[1]) as [string, string][],
  );

function load(p: AdminProduct) {
  Object.assign(form, {
    name: p.name,
    slug: p.slug,
    brandId: p.brandId,
    categoryId: p.categoryId,
    condition: p.condition,
    shortDescription: p.shortDescription ?? '',
    description: p.description ?? '',
    warrantyMonths: p.warrantyMonths,
    warrantyText: p.warrantyText ?? '',
    isFeatured: p.isFeatured,
    seoTitle: p.seoTitle ?? '',
    seoDescription: p.seoDescription ?? '',
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      name: v.name,
      price: toShillings(v.priceMinor),
      compareAt: toShillings(v.compareAtPriceMinor),
      cost: toShillings(v.costMinor),
      attributes: attributesToText(v.attributes),
      isDefault: v.isDefault,
      isActive: v.isActive,
      lowStockThreshold: v.inventory.lowStockThreshold,
      initialStock: 0,
      onHand: v.inventory.onHand,
      reserved: v.inventory.reserved,
    })),
    specifications: p.specifications.map((s) => ({ ...s })),
    images: p.images.map((i) => ({ storageKey: i.storageKey, url: i.url, alt: i.alt })),
  });
  slugTouched.value = true;
}
watch(
  () => product.data.value,
  (p) => p && load(p),
  { immediate: true },
);

const error = ref('');
const fields = ref<Record<string, string>>({});
const saved = ref('');

function payload() {
  return {
    name: form.name,
    slug: form.slug,
    brandId: form.brandId,
    categoryId: form.categoryId,
    condition: form.condition,
    shortDescription: form.shortDescription || null,
    description: form.description || null,
    warrantyMonths: Number(form.warrantyMonths) || 0,
    warrantyText: form.warrantyText || null,
    isFeatured: form.isFeatured,
    seoTitle: form.seoTitle || null,
    seoDescription: form.seoDescription || null,
    variants: form.variants.map((v) => ({
      ...(v.id ? { id: v.id } : {}),
      sku: v.sku.trim(),
      name: v.name.trim(),
      priceMinor: toMinor(v.price) ?? 0,
      compareAtPriceMinor: toMinor(v.compareAt),
      costMinor: toMinor(v.cost),
      attributes: textToAttributes(v.attributes),
      isDefault: v.isDefault,
      isActive: v.isActive,
      lowStockThreshold: Number(v.lowStockThreshold) || 0,
      initialStock: v.id ? 0 : Number(v.initialStock) || 0,
    })),
    specifications: form.specifications.filter((s) => s.key.trim() && s.value.trim()),
    images: form.images.map((i) => ({ storageKey: i.storageKey, alt: i.alt })),
  };
}

const save = useMutation({
  mutationFn: () =>
    id.value
      ? api.put<AdminProduct>(`/products/${id.value}`, payload())
      : api.post<AdminProduct>('/products', payload()),
  onSuccess: async (p) => {
    error.value = '';
    fields.value = {};
    saved.value = 'Saved.';
    queryClient.setQueryData(['admin-product', p.id], p);
    void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    if (!id.value) await router.replace({ name: 'product', params: { id: p.id } });
    else load(p);
  },
  onError: (e) => {
    saved.value = '';
    error.value = errorMessage(e);
    fields.value = fieldErrors(e);
  },
});

const setStatus = useMutation({
  mutationFn: (status: ProductStatusValue) =>
    api.post<AdminProduct>(`/products/${id.value}/status`, { status }),
  onSuccess: (p) => {
    queryClient.setQueryData(['admin-product', p.id], p);
    void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    error.value = '';
  },
  onError: (e) => (error.value = errorMessage(e)),
});

function setDefault(index: number) {
  form.variants.forEach((v, i) => (v.isDefault = i === index));
}
function removeVariant(index: number) {
  const [removed] = form.variants.splice(index, 1);
  if (removed?.isDefault && form.variants[0]) form.variants[0].isDefault = true;
}
function moveImage(index: number, by: -1 | 1) {
  const target = index + by;
  if (target < 0 || target >= form.images.length) return;
  const [item] = form.images.splice(index, 1);
  form.images.splice(target, 0, item!);
}
function addImage(media: MediaUpload) {
  form.images.push({ storageKey: media.storageKey, url: media.url, alt: form.name || '' });
}
const storefrontUrl = computed(() =>
  env.VITE_STOREFRONT_URL && product.data.value?.status === 'PUBLISHED'
    ? `${env.VITE_STOREFRONT_URL.replace(/\/$/, '')}/products/${product.data.value.slug}`
    : null,
);
const err = (path: string) => fields.value[path];
</script>

<template>
  <div>
    <RouterLink
      :to="{ name: 'products' }"
      class="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
    >
      <ArrowLeft class="size-4" aria-hidden="true" /> All products
    </RouterLink>
    <LoadingState v-if="id && product.isPending.value" />
    <ErrorNotice v-else-if="product.isError.value" :message="errorMessage(product.error.value)" />
    <form v-else class="space-y-5" novalidate @submit.prevent="save.mutate()">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <h2 class="text-xl font-bold tracking-tight">
            {{ id ? form.name || 'Product' : 'New product' }}
          </h2>
          <StatusBadge v-if="product.data.value" :status="product.data.value.status" />
          <a
            v-if="storefrontUrl"
            :href="storefrontUrl"
            target="_blank"
            rel="noopener"
            class="inline-flex items-center gap-1 text-sm text-brand-blue hover:underline"
          >
            View in store <ExternalLink class="size-3.5" aria-hidden="true" />
          </a>
        </div>
        <div class="flex flex-wrap gap-2">
          <template v-if="id && auth.can('products:publish') && product.data.value">
            <button
              v-if="product.data.value.status !== 'PUBLISHED'"
              type="button"
              class="btn btn-secondary"
              :disabled="setStatus.isPending.value"
              @click="setStatus.mutate('PUBLISHED')"
            >
              Publish
            </button>
            <button
              v-if="product.data.value.status === 'PUBLISHED'"
              type="button"
              class="btn btn-secondary"
              :disabled="setStatus.isPending.value"
              @click="setStatus.mutate('DRAFT')"
            >
              Unpublish
            </button>
            <button
              v-if="product.data.value.status !== 'ARCHIVED'"
              type="button"
              class="btn btn-ghost"
              :disabled="setStatus.isPending.value"
              @click="setStatus.mutate('ARCHIVED')"
            >
              Archive
            </button>
          </template>
          <button
            v-if="canEdit"
            type="submit"
            class="btn btn-primary"
            :disabled="save.isPending.value"
          >
            {{ save.isPending.value ? 'Saving…' : id ? 'Save changes' : 'Create draft' }}
          </button>
        </div>
      </div>
      <ErrorNotice :message="error" />
      <p
        v-if="saved && !error"
        role="status"
        class="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
      >
        {{ saved }}
      </p>

      <fieldset :disabled="!canEdit" class="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div class="space-y-5">
          <section class="card space-y-4 p-5">
            <h3 class="font-semibold">Details</h3>
            <div class="grid gap-4 md:grid-cols-2">
              <div>
                <label for="name" class="field-label">Name</label>
                <input
                  id="name"
                  v-model="form.name"
                  class="field-input"
                  required
                  :aria-invalid="!!err('name')"
                />
                <p v-if="err('name')" class="mt-1 text-xs text-red-700">{{ err('name') }}</p>
              </div>
              <div>
                <label for="slug" class="field-label">URL slug</label>
                <input
                  id="slug"
                  v-model="form.slug"
                  class="field-input font-mono"
                  required
                  :aria-invalid="!!err('slug')"
                  @input="slugTouched = true"
                />
                <p v-if="err('slug')" class="mt-1 text-xs text-red-700">{{ err('slug') }}</p>
              </div>
              <div>
                <label for="brand" class="field-label">Brand</label>
                <select
                  id="brand"
                  v-model="form.brandId"
                  class="field-input"
                  required
                  :aria-invalid="!!err('brandId')"
                >
                  <option value="" disabled>Choose a brand</option>
                  <option v-for="b in brands.data.value" :key="b.id" :value="b.id">
                    {{ b.name }}
                  </option>
                </select>
              </div>
              <div>
                <label for="category" class="field-label">Category</label>
                <select
                  id="category"
                  v-model="form.categoryId"
                  class="field-input"
                  required
                  :aria-invalid="!!err('categoryId')"
                >
                  <option value="" disabled>Choose a category</option>
                  <option v-for="c in categories.data.value" :key="c.id" :value="c.id">
                    {{ c.name }}
                  </option>
                </select>
              </div>
            </div>
            <div>
              <label for="short" class="field-label">Short description</label>
              <input
                id="short"
                v-model="form.shortDescription"
                class="field-input"
                maxlength="300"
              />
            </div>
            <div>
              <label for="description" class="field-label">Description</label>
              <textarea
                id="description"
                v-model="form.description"
                rows="8"
                class="field-input font-mono text-xs"
                aria-describedby="description-hint"
              />
              <p id="description-hint" class="mt-1 text-xs text-ink-muted">
                Basic HTML is allowed: paragraphs, headings, lists, bold, links and tables. Anything
                else (scripts, styles) is removed when saved.
              </p>
            </div>
          </section>

          <section class="card overflow-hidden">
            <div class="flex items-center justify-between px-5 pt-5">
              <h3 class="font-semibold">Variants</h3>
              <button
                type="button"
                class="btn btn-secondary !py-1.5"
                @click="form.variants.push(emptyVariant(form.variants.length === 0))"
              >
                <Plus class="size-4" aria-hidden="true" /> Add variant
              </button>
            </div>
            <p class="px-5 text-xs text-ink-muted">
              Prices are in KES and include VAT. Change stock later from Inventory.
            </p>
            <ErrorNotice v-if="err('variants')" class="mx-5 mt-2" :message="err('variants')" />
            <div class="mt-3 space-y-3 px-5 pb-5">
              <div
                v-for="(v, i) in form.variants"
                :key="v.id ?? i"
                :class="[
                  'rounded-xl border p-4',
                  v.isActive ? 'border-slate-200' : 'border-dashed border-slate-300 bg-slate-50',
                ]"
              >
                <div class="grid gap-3 md:grid-cols-4">
                  <div>
                    <label :for="`sku-${i}`" class="field-label">SKU</label>
                    <input
                      :id="`sku-${i}`"
                      v-model="v.sku"
                      class="field-input font-mono"
                      :aria-invalid="!!err(`variants.${i}.sku`)"
                    />
                    <p v-if="err(`variants.${i}.sku`)" class="mt-1 text-xs text-red-700">
                      {{ err(`variants.${i}.sku`) }}
                    </p>
                  </div>
                  <div class="md:col-span-3">
                    <label :for="`vname-${i}`" class="field-label">Name</label>
                    <input
                      :id="`vname-${i}`"
                      v-model="v.name"
                      class="field-input"
                      placeholder="e.g. Core i7 / 16GB / 512GB SSD"
                    />
                  </div>
                  <div>
                    <label :for="`price-${i}`" class="field-label">Price (KES)</label>
                    <input
                      :id="`price-${i}`"
                      v-model="v.price"
                      inputmode="decimal"
                      class="field-input"
                      :aria-invalid="!!err(`variants.${i}.priceMinor`)"
                    />
                    <p v-if="err(`variants.${i}.priceMinor`)" class="mt-1 text-xs text-red-700">
                      {{ err(`variants.${i}.priceMinor`) }}
                    </p>
                  </div>
                  <div>
                    <label :for="`was-${i}`" class="field-label">Was (optional)</label>
                    <input
                      :id="`was-${i}`"
                      v-model="v.compareAt"
                      inputmode="decimal"
                      class="field-input"
                      :aria-invalid="!!err(`variants.${i}.compareAtPriceMinor`)"
                    />
                    <p
                      v-if="err(`variants.${i}.compareAtPriceMinor`)"
                      class="mt-1 text-xs text-red-700"
                    >
                      {{ err(`variants.${i}.compareAtPriceMinor`) }}
                    </p>
                  </div>
                  <div>
                    <label :for="`cost-${i}`" class="field-label">Cost (staff only)</label>
                    <input
                      :id="`cost-${i}`"
                      v-model="v.cost"
                      inputmode="decimal"
                      class="field-input"
                    />
                  </div>
                  <div v-if="!v.id">
                    <label :for="`stock-${i}`" class="field-label">Opening stock</label>
                    <input
                      :id="`stock-${i}`"
                      v-model.number="v.initialStock"
                      type="number"
                      min="0"
                      class="field-input"
                    />
                  </div>
                  <div v-else>
                    <p class="field-label">Stock</p>
                    <p class="py-2 text-sm tabular-nums">
                      {{ v.onHand }} on hand · {{ v.reserved }} reserved
                    </p>
                  </div>
                  <div class="md:col-span-3">
                    <label :for="`attrs-${i}`" class="field-label">Options</label>
                    <input
                      :id="`attrs-${i}`"
                      v-model="v.attributes"
                      class="field-input"
                      placeholder="RAM: 16GB, Storage: 512GB SSD, Colour: Silver"
                    />
                  </div>
                  <div>
                    <label :for="`low-${i}`" class="field-label">Low stock alert at</label>
                    <input
                      :id="`low-${i}`"
                      v-model.number="v.lowStockThreshold"
                      type="number"
                      min="0"
                      class="field-input"
                    />
                  </div>
                </div>
                <div class="mt-3 flex flex-wrap items-center gap-4 text-sm">
                  <label class="flex items-center gap-2"
                    ><input
                      type="radio"
                      name="default-variant"
                      :checked="v.isDefault"
                      @change="setDefault(i)"
                    />
                    Default</label
                  >
                  <label class="flex items-center gap-2"
                    ><input v-model="v.isActive" type="checkbox" /> On sale</label
                  >
                  <button
                    v-if="!v.id && form.variants.length > 1"
                    type="button"
                    class="btn btn-ghost !p-1.5 ml-auto"
                    :aria-label="`Remove variant ${i + 1}`"
                    @click="removeVariant(i)"
                  >
                    <Trash2 class="size-4" aria-hidden="true" />
                  </button>
                  <span v-else-if="v.id" class="ml-auto text-xs text-ink-muted"
                    >Saved variants are switched off, not deleted, to keep order history.</span
                  >
                </div>
              </div>
            </div>
          </section>

          <section class="card p-5">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">Specifications</h3>
              <button
                type="button"
                class="btn btn-secondary !py-1.5"
                @click="
                  form.specifications.push({ group: '', key: '', value: '', isFilterable: false })
                "
              >
                <Plus class="size-4" aria-hidden="true" /> Add
              </button>
            </div>
            <p class="text-xs text-ink-muted">
              Filterable specifications appear as filters in the shop (e.g. RAM, Processor).
            </p>
            <div class="mt-3 space-y-2">
              <div
                v-for="(s, i) in form.specifications"
                :key="i"
                class="grid items-center gap-2 md:grid-cols-[10rem_10rem_1fr_auto_auto]"
              >
                <input
                  v-model="s.group"
                  class="field-input"
                  placeholder="Group, e.g. Memory"
                  :aria-label="`Specification ${i + 1} group`"
                />
                <input
                  v-model="s.key"
                  class="field-input"
                  placeholder="Name, e.g. RAM"
                  :aria-label="`Specification ${i + 1} name`"
                />
                <input
                  v-model="s.value"
                  class="field-input"
                  placeholder="Value, e.g. 16GB DDR5"
                  :aria-label="`Specification ${i + 1} value`"
                />
                <label class="flex items-center gap-1.5 text-xs"
                  ><input v-model="s.isFilterable" type="checkbox" /> Filter</label
                >
                <button
                  type="button"
                  class="btn btn-ghost !p-1.5"
                  :aria-label="`Remove specification ${i + 1}`"
                  @click="form.specifications.splice(i, 1)"
                >
                  <Trash2 class="size-4" aria-hidden="true" />
                </button>
              </div>
              <p v-if="!form.specifications.length" class="text-sm text-ink-muted">
                No specifications yet.
              </p>
            </div>
          </section>
        </div>

        <aside class="space-y-5">
          <section class="card space-y-3 p-5">
            <h3 class="font-semibold">Images</h3>
            <p class="text-xs text-ink-muted">
              The first image is the main one. Describe each image for shoppers using screen
              readers.
            </p>
            <ErrorNotice v-if="err('images')" :message="err('images')" />
            <ul class="space-y-3">
              <li
                v-for="(img, i) in form.images"
                :key="img.storageKey"
                class="rounded-xl border border-slate-200 p-2"
              >
                <div class="flex gap-2">
                  <img
                    v-if="img.url"
                    :src="img.url"
                    :alt="img.alt"
                    class="size-16 rounded-lg bg-slate-50 object-contain"
                  />
                  <div class="min-w-0 flex-1">
                    <label :for="`alt-${i}`" class="sr-only"
                      >Description of image {{ i + 1 }}</label
                    >
                    <input
                      :id="`alt-${i}`"
                      v-model="img.alt"
                      class="field-input !py-1.5 text-xs"
                      placeholder="What the image shows"
                      :aria-invalid="!!err(`images.${i}.alt`)"
                    />
                    <div class="mt-1 flex gap-1">
                      <button
                        type="button"
                        class="btn btn-ghost !p-1"
                        :aria-label="`Move image ${i + 1} up`"
                        :disabled="i === 0"
                        @click="moveImage(i, -1)"
                      >
                        <ArrowUp class="size-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        class="btn btn-ghost !p-1"
                        :aria-label="`Move image ${i + 1} down`"
                        :disabled="i === form.images.length - 1"
                        @click="moveImage(i, 1)"
                      >
                        <ArrowDown class="size-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        class="btn btn-ghost !p-1 ml-auto"
                        :aria-label="`Remove image ${i + 1}`"
                        @click="form.images.splice(i, 1)"
                      >
                        <Trash2 class="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            </ul>
            <ImageUploader v-if="canEdit" folder="products" multiple @uploaded="addImage" />
          </section>
          <section class="card space-y-3 p-5">
            <h3 class="font-semibold">Options</h3>
            <div>
              <label for="condition" class="field-label">Condition</label>
              <select id="condition" v-model="form.condition" class="field-input">
                <option value="NEW">New</option>
                <option value="REFURBISHED">Refurbished</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label for="warranty" class="field-label">Warranty (months)</label>
                <input
                  id="warranty"
                  v-model.number="form.warrantyMonths"
                  type="number"
                  min="0"
                  max="120"
                  class="field-input"
                />
              </div>
              <div>
                <label for="warranty-text" class="field-label">Warranty note</label>
                <input
                  id="warranty-text"
                  v-model="form.warrantyText"
                  class="field-input"
                  placeholder="Manufacturer"
                />
              </div>
            </div>
            <label class="flex items-center gap-2 text-sm"
              ><input v-model="form.isFeatured" type="checkbox" /> Feature on the homepage</label
            >
          </section>
          <section class="card space-y-3 p-5">
            <h3 class="font-semibold">Search engines</h3>
            <div>
              <label for="seo-title" class="field-label"
                >Title ({{ form.seoTitle.length }}/70)</label
              >
              <input
                id="seo-title"
                v-model="form.seoTitle"
                class="field-input"
                maxlength="70"
                :placeholder="form.name"
              />
            </div>
            <div>
              <label for="seo-desc" class="field-label"
                >Description ({{ form.seoDescription.length }}/170)</label
              >
              <textarea
                id="seo-desc"
                v-model="form.seoDescription"
                class="field-input"
                rows="3"
                maxlength="170"
              />
            </div>
          </section>
        </aside>
      </fieldset>
    </form>
  </div>
</template>
