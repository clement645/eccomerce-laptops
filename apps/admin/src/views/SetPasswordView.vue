<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { ApiError } from '@repo/api-client';
import { api } from '@/lib/api';

/** Opened from the staff invitation email. The token in the link is single use. */
const route = useRoute();
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''));
const password = ref('');
const confirm = ref('');
const error = ref('');
const pending = ref(false);
const done = ref(false);

async function submit() {
  error.value = '';
  if (password.value !== confirm.value) {
    error.value = 'The passwords do not match.';
    return;
  }
  pending.value = true;
  try {
    await api.request('/admin/auth/set-password', {
      method: 'POST',
      body: { token: token.value, password: password.value },
    });
    done.value = true;
  } catch (e) {
    error.value =
      e instanceof ApiError && e.code === 'VALIDATION_FAILED'
        ? 'Use at least 12 characters. A few unrelated words work well.'
        : e instanceof ApiError
          ? e.message
          : 'Something went wrong. Check your connection.';
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <main
    class="grid min-h-dvh place-items-center bg-navy-950 bg-[radial-gradient(60%_60%_at_80%_20%,rgb(124_58_237/0.35),transparent)] p-4"
  >
    <div class="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl md:p-8">
      <div class="flex items-center gap-2.5">
        <img src="/favicon.svg" alt="" class="size-9" /><span class="font-bold">Store Admin</span>
      </div>
      <template v-if="done">
        <h1 class="mt-6 text-2xl font-extrabold">Password set</h1>
        <p class="mt-2 text-sm text-ink-muted">
          Sign in now. You will be asked to set up an authenticator app.
        </p>
        <RouterLink :to="{ name: 'login' }" class="btn btn-primary mt-6 w-full"
          >Go to sign in</RouterLink
        >
      </template>
      <template v-else-if="!token">
        <h1 class="mt-6 text-2xl font-extrabold">Link incomplete</h1>
        <p class="mt-2 text-sm text-ink-muted">
          Open the full link from your invitation email, or ask an administrator to send a new one.
        </p>
      </template>
      <form v-else class="mt-6 space-y-4" @submit.prevent="submit">
        <h1 class="text-2xl font-extrabold">Set your password</h1>
        <p v-if="error" role="alert" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {{ error }}
        </p>
        <div>
          <label for="new-password" class="field-label">New password</label>
          <input
            id="new-password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            minlength="12"
            required
            class="field-input"
            aria-describedby="password-hint"
          />
          <p id="password-hint" class="mt-1 text-xs text-ink-muted">At least 12 characters.</p>
        </div>
        <div>
          <label for="confirm-password" class="field-label">Confirm password</label>
          <input
            id="confirm-password"
            v-model="confirm"
            type="password"
            autocomplete="new-password"
            required
            class="field-input"
          />
        </div>
        <button
          type="submit"
          class="bg-brand-gradient w-full rounded-full px-6 py-3 text-sm font-semibold text-white disabled:opacity-70"
          :disabled="pending"
        >
          {{ pending ? 'Saving…' : 'Set password' }}
        </button>
      </form>
    </div>
  </main>
</template>
