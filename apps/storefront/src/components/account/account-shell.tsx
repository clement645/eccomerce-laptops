'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { Loader2, LogOut, MapPin, Package, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';
import { cn } from '@/lib/cn';

const NAV = [
  { href: '/account', label: 'Profile', icon: User },
  { href: '/account/orders', label: 'Orders', icon: Package },
  { href: '/account/addresses', label: 'Addresses', icon: MapPin },
  { href: '/account/security', label: 'Security', icon: ShieldCheck },
];

/** Client-side gate for account pages. The API enforces access on every request regardless. */
export function AccountShell({ title, children }: { title: string; children: ReactNode }) {
  const { status, user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Signing out deliberately goes home; only an expired or missing session goes to the sign-in page.
  const signingOut = useRef(false);

  useEffect(() => {
    if (status === 'anonymous' && !signingOut.current)
      router.replace(`/account/login?next=${encodeURIComponent(pathname)}`);
  }, [status, pathname, router]);

  if (status !== 'authenticated' || !user) {
    return (
      <main id="main" className="flex flex-1 items-center justify-center py-24">
        <p role="status" className="flex items-center gap-2 text-ink-muted">
          <Loader2 aria-hidden className="size-5 animate-spin" /> Loading your account…
        </p>
      </main>
    );
  }

  return (
    <main id="main" className="flex-1 bg-surface-muted">
      <div className="container-page py-8 md:py-12">
        <p className="text-sm text-ink-muted">Hello, {user.firstName}</p>
        <h1 className="mt-1 text-3xl font-extrabold">{title}</h1>
        <div className="mt-8 grid gap-6 lg:grid-cols-[240px_1fr]">
          <nav
            aria-label="Account"
            className="h-fit rounded-2xl border border-line bg-white p-2 shadow-card"
          >
            <ul className="flex gap-1 overflow-x-auto scrollbar-none lg:flex-col">
              {NAV.map(({ href, label, icon: Icon }) => {
                const active = href === '/account' ? pathname === href : pathname.startsWith(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition',
                        active
                          ? 'bg-primary-50 text-primary-700'
                          : 'text-ink hover:bg-surface-muted',
                      )}
                    >
                      <Icon aria-hidden className="size-4" />
                      {label}
                    </Link>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  onClick={async () => {
                    signingOut.current = true;
                    await signOut();
                    router.replace('/');
                  }}
                  className="flex w-full items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium text-ink hover:bg-surface-muted"
                >
                  <LogOut aria-hidden className="size-4" />
                  Sign out
                </button>
              </li>
            </ul>
          </nav>
          <div className="min-w-0 space-y-6">{children}</div>
        </div>
      </div>
    </main>
  );
}

export function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-2xl border border-line bg-white p-5 shadow-card md:p-6"
      aria-label={title}
    >
      <h2 className="text-lg font-bold">{title}</h2>
      {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
