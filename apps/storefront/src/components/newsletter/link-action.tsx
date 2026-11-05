'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { publicApi } from '@/lib/auth/auth-context';
import { routes } from '@/lib/routes';

/**
 * Confirms or cancels a newsletter subscription from an emailed link. Runs on page load: the
 * link is single purpose, and the API ignores repeats.
 */
export function NewsletterLinkAction({ action }: { action: 'confirm' | 'unsubscribe' }) {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<'working' | 'done' | 'failed'>(token ? 'working' : 'failed');
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    publicApi
      .request(`/newsletter/${action}`, { method: 'POST', body: { token } })
      .then(() => setState('done'))
      .catch(() => setState('failed'));
  }, [action, token]);

  const copy = {
    confirm: {
      done: [
        "You're subscribed",
        "Thanks for confirming. We'll send new arrivals and offers about twice a month.",
      ],
      failed: [
        'This link has expired',
        'Confirmation links work for 7 days. Sign up again from the bottom of any page.',
      ],
    },
    unsubscribe: {
      done: [
        "You've been unsubscribed",
        "You won't receive our newsletter any more. You can sign up again at any time.",
      ],
      failed: [
        'This link is not valid',
        'Use the unsubscribe link from the most recent newsletter, or contact us.',
      ],
    },
  }[action];

  if (state === 'working')
    return (
      <p role="status" className="flex items-center gap-2 text-ink-muted">
        <Loader2 aria-hidden className="size-5 animate-spin" /> One moment…
      </p>
    );
  const [title, body] = copy[state];
  const Icon = state === 'done' ? CheckCircle2 : XCircle;
  return (
    <div role="status">
      <Icon
        aria-hidden
        className={`size-10 ${state === 'done' ? 'text-success' : 'text-danger'}`}
      />
      <h1 className="mt-4 text-2xl font-extrabold">{title}</h1>
      <p className="mt-2 text-ink-muted">{body}</p>
      <Link
        href={routes.home}
        className="mt-6 inline-block font-semibold text-primary-600 hover:underline"
      >
        Back to the store
      </Link>
    </div>
  );
}
