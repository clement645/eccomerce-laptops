'use client';

import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { ApiError } from '@repo/api-client';
import { newsletterSubscribeSchema } from '@repo/validation';
import { publicApi } from '@/lib/auth/auth-context';

/** Footer sign-up. The API sends a confirmation link; nobody is subscribed until they click it. */
export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const subscribe = useMutation({
    mutationFn: (value: string) =>
      publicApi.request<{ message: string }>('/newsletter/subscribe', {
        method: 'POST',
        body: { email: value, source: 'footer' },
      }),
    onError: (e) =>
      setError(
        e instanceof ApiError && e.status === 429
          ? 'Too many attempts. Try again in a few minutes.'
          : 'Could not subscribe right now. Please try again.',
      ),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = newsletterSubscribeSchema.safeParse({ email });
    if (!parsed.success) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    subscribe.mutate(parsed.data.email);
  }

  if (subscribe.isSuccess)
    return (
      <p role="status" className="mt-4 rounded-xl bg-white/10 px-4 py-3 text-sm text-white">
        Almost done: check your inbox and click the link to confirm.
      </p>
    );

  return (
    <form
      className="mt-4 space-y-2.5"
      noValidate
      onSubmit={submit}
      aria-describedby="newsletter-note"
    >
      <label htmlFor="newsletter-email" className="sr-only">
        Email address
      </label>
      <input
        id="newsletter-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email address"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'newsletter-error' : undefined}
        className="w-full rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/60 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/40"
      />
      <button
        type="submit"
        disabled={subscribe.isPending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-500 disabled:opacity-70"
      >
        {subscribe.isPending && <Loader2 aria-hidden className="size-4 animate-spin" />}
        Subscribe
      </button>
      {error ? (
        <p id="newsletter-error" role="alert" className="text-xs text-red-300">
          {error}
        </p>
      ) : (
        <p id="newsletter-note" className="text-xs text-white/60">
          We&apos;ll email you a link to confirm.
        </p>
      )}
    </form>
  );
}
