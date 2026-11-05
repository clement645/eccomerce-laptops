<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import type { EditableSettingKey } from '@repo/shared-types';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { toMinor, toShillings } from '@/lib/format';

type Settings = Record<EditableSettingKey, Record<string, unknown> | null>;
const api = useAdminApi();
const queryClient = useQueryClient();
const query = useQuery({
  queryKey: ['admin-settings'],
  queryFn: () => api.get<Settings>('/settings'),
});

const profile = reactive({ name: '', tagline: '' });
const contact = reactive({
  email: '',
  phone: '',
  whatsappNumber: '',
  address: '',
  mapUrl: '',
  openingHours: '',
});
const social = reactive({ facebook: '', instagram: '', x: '', tiktok: '', youtube: '' });
const announcement = reactive({ enabled: true, messages: '', href: '' });
const reservation = reactive({ holdMinutes: 15 });
const cod = reactive({ enabled: false, counties: '', maxOrder: '' });

const str = (v: unknown) => (typeof v === 'string' ? v : '');
watch(
  () => query.data.value,
  (s) => {
    if (!s) return;
    Object.assign(profile, {
      name: str(s['store.profile']?.name),
      tagline: str(s['store.profile']?.tagline),
    });
    const c = s['store.contact'] ?? {};
    Object.assign(contact, {
      email: str(c.email),
      phone: str(c.phone),
      whatsappNumber: str(c.whatsappNumber),
      address: str(c.address),
      mapUrl: str(c.mapUrl),
      openingHours: str(c.openingHours),
    });
    const so = s['store.social'] ?? {};
    Object.assign(social, {
      facebook: str(so.facebook),
      instagram: str(so.instagram),
      x: str(so.x),
      tiktok: str(so.tiktok),
      youtube: str(so.youtube),
    });
    const a = s['announcement.bar'] ?? {};
    Object.assign(announcement, {
      enabled: a.enabled !== false,
      messages: Array.isArray(a.messages) ? (a.messages as string[]).join('\n') : '',
      href: str(a.href),
    });
    reservation.holdMinutes = Number(s['checkout.reservation']?.holdMinutes ?? 15);
    const d = s['checkout.cashOnDelivery'] ?? {};
    Object.assign(cod, {
      enabled: d.enabled === true,
      counties: Array.isArray(d.counties) ? (d.counties as string[]).join(', ') : '',
      maxOrder: d.maxOrderMinor ? toShillings(Number(d.maxOrderMinor)) : '',
    });
  },
  { immediate: true },
);

const status = reactive<
  Record<string, { error: string; fields: Record<string, string>; saved: boolean }>
>({});
const saving = ref<string | null>(null);
const save = useMutation({
  mutationFn: (input: { key: EditableSettingKey; value: unknown }) =>
    api.put(`/settings/${input.key}`, input.value),
  onMutate: ({ key }) => {
    saving.value = key;
    status[key] = { error: '', fields: {}, saved: false };
  },
  onSuccess: (_d, { key }) => {
    status[key] = { error: '', fields: {}, saved: true };
    void queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
  },
  onError: (e, { key }) =>
    (status[key] = { error: errorMessage(e), fields: fieldErrors(e), saved: false }),
  onSettled: () => (saving.value = null),
});

const lines = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
const list = (text: string) =>
  text
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean);
const sections: Record<EditableSettingKey, () => unknown> = {
  'store.profile': () => ({
    name: profile.name,
    tagline: profile.tagline || null,
    currency: 'KES',
    locale: 'en-KE',
  }),
  'store.contact': () => ({ ...contact }),
  'store.social': () => ({ ...social }),
  'announcement.bar': () => ({
    enabled: announcement.enabled,
    messages: lines(announcement.messages),
    href: announcement.href || null,
  }),
  'checkout.reservation': () => ({ holdMinutes: Number(reservation.holdMinutes) }),
  'checkout.cashOnDelivery': () => ({
    enabled: cod.enabled,
    counties: list(cod.counties),
    maxOrderMinor: toMinor(cod.maxOrder) ?? 0,
  }),
};
const submit = (key: EditableSettingKey) => save.mutate({ key, value: sections[key]() });
const err = (key: string, field: string) => status[key]?.fields[field];
</script>

<template>
  <div>
    <PageHeader
      title="Store settings"
      description="Shown on the storefront within a few seconds of saving. Every change is recorded in the audit log."
    />
    <ErrorNotice v-if="query.isError.value" :message="errorMessage(query.error.value)" />
    <LoadingState v-else-if="query.isPending.value" />
    <div v-else class="grid gap-5 xl:grid-cols-2">
      <form class="card space-y-3 p-5" @submit.prevent="submit('store.profile')">
        <h3 class="font-semibold">Store</h3>
        <div>
          <label for="s-name" class="field-label">Store name</label
          ><input id="s-name" v-model="profile.name" class="field-input" required />
        </div>
        <div>
          <label for="s-tag" class="field-label">Tagline</label
          ><input id="s-tag" v-model="profile.tagline" class="field-input" maxlength="120" />
        </div>
        <ErrorNotice :message="status['store.profile']?.error" />
        <div class="flex items-center gap-3">
          <button type="submit" class="btn btn-primary" :disabled="saving === 'store.profile'">
            Save</button
          ><span
            v-if="status['store.profile']?.saved"
            role="status"
            class="text-sm text-emerald-700"
            >Saved</span
          >
        </div>
      </form>

      <form class="card space-y-3 p-5" @submit.prevent="submit('store.contact')">
        <h3 class="font-semibold">Contact details</h3>
        <p class="text-xs text-ink-muted">
          Shown in the footer and on the contact page. Contact-form messages are forwarded to this
          email.
        </p>
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label for="s-email" class="field-label">Email</label
            ><input
              id="s-email"
              v-model="contact.email"
              type="email"
              class="field-input"
              :aria-invalid="!!err('store.contact', 'email')"
            />
            <p v-if="err('store.contact', 'email')" class="mt-1 text-xs text-red-700">
              {{ err('store.contact', 'email') }}
            </p>
          </div>
          <div>
            <label for="s-phone" class="field-label">Phone</label
            ><input
              id="s-phone"
              v-model="contact.phone"
              type="tel"
              class="field-input"
              :aria-invalid="!!err('store.contact', 'phone')"
            />
            <p v-if="err('store.contact', 'phone')" class="mt-1 text-xs text-red-700">
              {{ err('store.contact', 'phone') }}
            </p>
          </div>
          <div>
            <label for="s-wa" class="field-label">WhatsApp</label
            ><input
              id="s-wa"
              v-model="contact.whatsappNumber"
              type="tel"
              class="field-input"
              :aria-invalid="!!err('store.contact', 'whatsappNumber')"
            />
          </div>
          <div>
            <label for="s-hours" class="field-label">Opening hours</label
            ><input
              id="s-hours"
              v-model="contact.openingHours"
              class="field-input"
              placeholder="Mon–Sat 9am–6pm"
            />
          </div>
        </div>
        <div>
          <label for="s-addr" class="field-label">Address</label
          ><input id="s-addr" v-model="contact.address" class="field-input" />
        </div>
        <div>
          <label for="s-map" class="field-label">Map link (https)</label
          ><input
            id="s-map"
            v-model="contact.mapUrl"
            type="url"
            class="field-input"
            :aria-invalid="!!err('store.contact', 'mapUrl')"
          />
          <p v-if="err('store.contact', 'mapUrl')" class="mt-1 text-xs text-red-700">
            {{ err('store.contact', 'mapUrl') }}
          </p>
        </div>
        <ErrorNotice :message="status['store.contact']?.error" />
        <div class="flex items-center gap-3">
          <button type="submit" class="btn btn-primary" :disabled="saving === 'store.contact'">
            Save</button
          ><span
            v-if="status['store.contact']?.saved"
            role="status"
            class="text-sm text-emerald-700"
            >Saved</span
          >
        </div>
      </form>

      <form class="card space-y-3 p-5" @submit.prevent="submit('announcement.bar')">
        <h3 class="font-semibold">Announcement bar</h3>
        <label class="flex items-center gap-2 text-sm"
          ><input v-model="announcement.enabled" type="checkbox" /> Show at the top of every
          page</label
        >
        <div>
          <label for="s-msgs" class="field-label">Messages (one per line, up to 5)</label
          ><textarea id="s-msgs" v-model="announcement.messages" rows="4" class="field-input" />
        </div>
        <div>
          <label for="s-href" class="field-label">Link (optional)</label
          ><input
            id="s-href"
            v-model="announcement.href"
            class="field-input"
            placeholder="/deals"
            :aria-invalid="!!err('announcement.bar', 'href')"
          />
          <p v-if="err('announcement.bar', 'href')" class="mt-1 text-xs text-red-700">
            {{ err('announcement.bar', 'href') }}
          </p>
        </div>
        <ErrorNotice :message="status['announcement.bar']?.error" />
        <div class="flex items-center gap-3">
          <button type="submit" class="btn btn-primary" :disabled="saving === 'announcement.bar'">
            Save</button
          ><span
            v-if="status['announcement.bar']?.saved"
            role="status"
            class="text-sm text-emerald-700"
            >Saved</span
          >
        </div>
      </form>

      <form class="card space-y-3 p-5" @submit.prevent="submit('store.social')">
        <h3 class="font-semibold">Social links (https)</h3>
        <div class="grid gap-3 sm:grid-cols-2">
          <div
            v-for="(label, k) in {
              facebook: 'Facebook',
              instagram: 'Instagram',
              x: 'X',
              tiktok: 'TikTok',
              youtube: 'YouTube',
            }"
            :key="k"
          >
            <label :for="`s-${k}`" class="field-label">{{ label }}</label>
            <input
              :id="`s-${k}`"
              v-model="social[k]"
              type="url"
              class="field-input"
              :aria-invalid="!!err('store.social', k)"
            />
          </div>
        </div>
        <ErrorNotice :message="status['store.social']?.error" />
        <div class="flex items-center gap-3">
          <button type="submit" class="btn btn-primary" :disabled="saving === 'store.social'">
            Save</button
          ><span v-if="status['store.social']?.saved" role="status" class="text-sm text-emerald-700"
            >Saved</span
          >
        </div>
      </form>

      <form class="card space-y-3 p-5" @submit.prevent="submit('checkout.cashOnDelivery')">
        <h3 class="font-semibold">Cash on delivery</h3>
        <label class="flex items-center gap-2 text-sm"
          ><input v-model="cod.enabled" type="checkbox" /> Offer cash on delivery</label
        >
        <div>
          <label for="s-counties" class="field-label"
            >Counties (comma-separated; empty means all)</label
          ><input
            id="s-counties"
            v-model="cod.counties"
            class="field-input"
            placeholder="Nairobi, Kiambu"
          />
        </div>
        <div>
          <label for="s-codmax" class="field-label">Maximum order (KES; empty means no limit)</label
          ><input id="s-codmax" v-model="cod.maxOrder" inputmode="decimal" class="field-input" />
        </div>
        <ErrorNotice :message="status['checkout.cashOnDelivery']?.error" />
        <div class="flex items-center gap-3">
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="saving === 'checkout.cashOnDelivery'"
          >
            Save</button
          ><span
            v-if="status['checkout.cashOnDelivery']?.saved"
            role="status"
            class="text-sm text-emerald-700"
            >Saved</span
          >
        </div>
      </form>

      <form class="card space-y-3 p-5" @submit.prevent="submit('checkout.reservation')">
        <h3 class="font-semibold">M-Pesa payment window</h3>
        <p class="text-xs text-ink-muted">
          How long items stay reserved while a customer completes an M-Pesa payment (5–60 minutes).
        </p>
        <div>
          <label for="s-hold" class="field-label">Minutes</label
          ><input
            id="s-hold"
            v-model.number="reservation.holdMinutes"
            type="number"
            min="5"
            max="60"
            class="field-input !w-32"
          />
        </div>
        <ErrorNotice :message="status['checkout.reservation']?.error" />
        <div class="flex items-center gap-3">
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="saving === 'checkout.reservation'"
          >
            Save</button
          ><span
            v-if="status['checkout.reservation']?.saved"
            role="status"
            class="text-sm text-emerald-700"
            >Saved</span
          >
        </div>
      </form>
    </div>
  </div>
</template>
