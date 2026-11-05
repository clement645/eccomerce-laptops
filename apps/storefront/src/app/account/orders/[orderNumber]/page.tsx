import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AccountShell } from '@/components/account/account-shell';
import { OrderDetailPanel } from '@/components/account/orders-panel';

export const metadata: Metadata = { title: 'Order details' };

async function Detail({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  return (
    <AccountShell title="Order details">
      <OrderDetailPanel orderNumber={orderNumber} />
    </AccountShell>
  );
}

/** Dynamic route: the shell reads the URL, so the whole page streams behind Suspense. */
export default function OrderDetailPage({ params }: PageProps<'/account/orders/[orderNumber]'>) {
  return (
    <Suspense>
      <Detail params={params} />
    </Suspense>
  );
}
