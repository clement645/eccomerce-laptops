import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { TrackedOrder } from '@/components/orders/tracked-order';

export const metadata: Metadata = {
  title: 'Order confirmation',
  robots: { index: false, follow: false },
};

async function Confirmation({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : '';
  return <TrackedOrder token={token} simulated={params.simulated === '1'} />;
}

export default function ConfirmationPage({ searchParams }: PageProps<'/checkout/confirmation'>) {
  return (
    <main id="main" className="flex-1 bg-surface-muted">
      <div className="container-page max-w-5xl py-10">
        <h1 className="mb-6 text-3xl font-extrabold">Thank you for your order</h1>
        <Suspense>
          <Confirmation searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
