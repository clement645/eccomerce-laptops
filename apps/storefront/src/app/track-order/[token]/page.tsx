import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TrackedOrder } from '@/components/orders/tracked-order';

export const metadata: Metadata = {
  title: 'Track your order',
  robots: { index: false, follow: false },
};

async function Tracked({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <TrackedOrder token={token} />;
}

export default function TrackOrderPage({ params }: PageProps<'/track-order/[token]'>) {
  return (
    <main id="main" className="flex-1 bg-surface-muted">
      <div className="container-page max-w-5xl py-10">
        <h1 className="mb-6 text-3xl font-extrabold">Track your order</h1>
        <Suspense>
          <Tracked params={params} />
        </Suspense>
      </div>
    </main>
  );
}
