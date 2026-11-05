import type { Metadata } from 'next';
import { AccountShell } from '@/components/account/account-shell';
import { OrdersPanel } from '@/components/account/orders-panel';

export const metadata: Metadata = { title: 'Orders' };

export default function OrdersPage() {
  return (
    <AccountShell title="Orders">
      <OrdersPanel />
    </AccountShell>
  );
}
