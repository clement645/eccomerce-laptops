import type { Metadata } from 'next';
import Link from 'next/link';
import { PackageSearch } from 'lucide-react';

export const metadata: Metadata = { title: 'Track your order' };

/** Orders are tracked with the private link from the confirmation email, never by order number alone. */
export default function TrackOrderHelpPage() {
  return (
    <main id="main" className="flex flex-1 items-center justify-center bg-surface-muted px-4 py-16">
      <div className="max-w-md rounded-3xl border border-line bg-white p-8 text-center shadow-card">
        <PackageSearch aria-hidden className="mx-auto size-12 text-primary-600" />
        <h1 className="mt-4 text-2xl font-extrabold">Track your order</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          Use the <strong>Track your order</strong> link in your order confirmation email. For your
          privacy, orders can&apos;t be looked up by order number alone.
        </p>
        <p className="mt-3 text-sm text-ink-muted">
          Have an account? Your orders are always listed there.
        </p>
        <Link
          href="/account/orders"
          className="mt-6 inline-flex rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-button"
        >
          My orders
        </Link>
      </div>
    </main>
  );
}
