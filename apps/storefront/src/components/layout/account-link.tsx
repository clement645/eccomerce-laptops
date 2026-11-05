'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { User } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';

const noop = () => () => {};

/**
 * Header account icon: initials when signed in. The session is only known in the browser, so the
 * first render matches the server (signed out) and switches after hydration.
 */
export function AccountLink({ className }: { className?: string }) {
  const { status, user } = useAuth();
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const signedIn = hydrated && status === 'authenticated' && user;
  return (
    <Link
      href={signedIn ? '/account' : '/account/login'}
      className={`relative size-10 place-items-center rounded-full text-ink transition hover:bg-primary-50 hover:text-primary-600 ${className ?? 'grid'}`}
    >
      {signedIn ? (
        <span
          aria-hidden
          className="bg-brand-gradient grid size-8 place-items-center rounded-full text-xs font-bold text-white"
        >
          {`${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() || 'Me'}
        </span>
      ) : (
        <User aria-hidden className="size-5" />
      )}
      <span className="sr-only">{signedIn ? `My account (${user.firstName})` : 'Sign in'}</span>
    </Link>
  );
}
