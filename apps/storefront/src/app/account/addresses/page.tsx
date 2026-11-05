import type { Metadata } from 'next';
import { AccountShell } from '@/components/account/account-shell';
import { AddressesPanel } from '@/components/account/addresses-panel';

export const metadata: Metadata = { title: 'Addresses' };

export default function AddressesPage() {
  return (
    <AccountShell title="Addresses">
      <AddressesPanel />
    </AccountShell>
  );
}
