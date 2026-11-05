'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { ApiError } from '@repo/api-client';
import { publicApi } from '@/lib/auth/auth-context';

export function VerifyEmail() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'pending' | 'done' | 'failed'>(token ? 'pending' : 'failed');
  const [message, setMessage] = useState(token ? '' : 'This link is incomplete.');
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    // Remove the token from the address bar and browser history.
    window.history.replaceState(null, '', '/account/verify-email');
    publicApi
      .request('/auth/verify-email', { method: 'POST', body: { token } })
      .then(() => setState('done'))
      .catch((error: unknown) => {
        setState('failed');
        setMessage(
          error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
        );
      });
  }, [token]);

  if (state === 'pending') {
    return (
      <p role="status" className="flex items-center justify-center gap-2 py-6 text-ink-muted">
        <Loader2 aria-hidden className="size-5 animate-spin" /> Confirming your email…
      </p>
    );
  }
  return (
    <div className="py-2 text-center" role="status">
      {state === 'done' ? (
        <CheckCircle2 aria-hidden className="mx-auto size-12 text-success" />
      ) : (
        <XCircle aria-hidden className="mx-auto size-12 text-danger" />
      )}
      <h2 className="mt-4 text-lg font-bold">
        {state === 'done' ? 'Email confirmed' : "We couldn't confirm your email"}
      </h2>
      <p className="mt-2 text-sm text-ink-muted">
        {state === 'done'
          ? 'Your account is ready. Sign in to continue.'
          : `${message} Sign in to request a new link.`}
      </p>
      <Link
        href="/account/login"
        className="mt-6 inline-flex rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-button"
      >
        Sign in
      </Link>
    </div>
  );
}
