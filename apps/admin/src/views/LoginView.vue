<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import QRCode from 'qrcode';
import { ApiError } from '@repo/api-client';
import type { AdminLoginChallenge } from '@repo/shared-types';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const step = ref<'credentials' | 'setup' | 'verify'>('credentials');
const email = ref('');
const password = ref('');
const code = ref('');
const challenge = ref<AdminLoginChallenge | null>(null);
const qrDataUrl = ref('');
const manualSecret = ref('');
const error = ref('');
const pending = ref(false);

const redirectTo = computed(() => {
  const next = route.query.next;
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/';
});

function message(e: unknown): string {
  if (e instanceof ApiError)
    return e.status === 429 && e.code === 'RATE_LIMITED'
      ? 'Too many attempts. Wait a few minutes.'
      : e.message;
  return 'Something went wrong. Check your connection.';
}

async function submitCredentials() {
  error.value = '';
  pending.value = true;
  try {
    challenge.value = await auth.login(email.value.trim(), password.value);
    password.value = '';
    if (challenge.value.stage === 'mfa_setup') {
      const setup = await auth.setupMfa(challenge.value.challengeToken);
      manualSecret.value = setup.secret.replace(/(.{4})/g, '$1 ').trim();
      qrDataUrl.value = await QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 200 });
      step.value = 'setup';
    } else {
      step.value = 'verify';
    }
  } catch (e) {
    error.value = message(e);
  } finally {
    pending.value = false;
  }
}

async function submitCode() {
  if (!challenge.value) return;
  error.value = '';
  pending.value = true;
  try {
    await auth.verifyMfa(challenge.value.challengeToken, code.value.replace(/\s/g, ''));
    await router.replace(redirectTo.value);
  } catch (e) {
    code.value = '';
    if (e instanceof ApiError && e.code === 'INVALID_CHALLENGE') {
      step.value = 'credentials';
      challenge.value = null;
    }
    error.value = message(e);
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
        <img src="/favicon.svg" alt="" class="size-9" />
        <span class="font-bold">Store Admin</span>
      </div>

      <p v-if="error" role="alert" class="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
        {{ error }}
      </p>

      <form
        v-if="step === 'credentials'"
        class="mt-6 space-y-4"
        @submit.prevent="submitCredentials"
      >
        <h1 class="text-2xl font-extrabold">Staff sign in</h1>
        <div>
          <label for="email" class="mb-1.5 block text-sm font-semibold">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            autocomplete="username"
            required
            class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-4 focus:ring-indigo-100"
          />
        </div>
        <div>
          <label for="password" class="mb-1.5 block text-sm font-semibold">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            class="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-brand-blue focus:outline-none focus:ring-4 focus:ring-indigo-100"
          />
        </div>
        <button
          type="submit"
          :disabled="pending"
          class="bg-brand-gradient w-full rounded-full px-6 py-3 text-sm font-semibold text-white disabled:opacity-70"
        >
          {{ pending ? 'Checking…' : 'Continue' }}
        </button>
      </form>

      <form v-else class="mt-6 space-y-4" @submit.prevent="submitCode">
        <template v-if="step === 'setup'">
          <h1 class="text-2xl font-extrabold">Set up two-factor sign-in</h1>
          <p class="text-sm text-ink-muted">
            Scan this code with Google Authenticator, Microsoft Authenticator or a similar app, then
            enter the 6-digit code it shows.
          </p>
          <img
            :src="qrDataUrl"
            alt="QR code for your authenticator app"
            class="mx-auto size-48 rounded-xl border border-slate-200"
          />
          <p class="text-center text-xs text-ink-muted">
            Can't scan? Enter this key:<br />
            <code
              class="mt-1 inline-block break-all rounded-lg bg-slate-100 px-2 py-1 font-mono text-sm text-ink"
              data-testid="mfa-secret"
              >{{ manualSecret }}</code
            >
          </p>
        </template>
        <template v-else>
          <h1 class="text-2xl font-extrabold">Enter your code</h1>
          <p class="text-sm text-ink-muted">
            Open your authenticator app and enter the 6-digit code.
          </p>
        </template>
        <div>
          <label for="code" class="mb-1.5 block text-sm font-semibold">Authentication code</label>
          <input
            id="code"
            v-model="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="\d{6}"
            maxlength="6"
            required
            class="w-full rounded-xl border border-slate-200 px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] focus:border-brand-blue focus:outline-none focus:ring-4 focus:ring-indigo-100"
          />
        </div>
        <button
          type="submit"
          :disabled="pending || code.length !== 6"
          class="bg-brand-gradient w-full rounded-full px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {{ pending ? 'Verifying…' : 'Verify and sign in' }}
        </button>
        <button
          type="button"
          class="w-full text-sm font-semibold text-ink-muted"
          @click="
            step = 'credentials';
            error = '';
          "
        >
          Start again
        </button>
      </form>
    </div>
  </main>
</template>
