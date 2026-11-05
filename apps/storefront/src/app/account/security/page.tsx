import type { Metadata } from 'next';
import { AccountShell } from '@/components/account/account-shell';
import { SecurityPanel } from '@/components/account/security-panel';

export const metadata: Metadata = { title: 'Security' };

export default function SecurityPage() {
  return (
    <AccountShell title="Security">
      <SecurityPanel />
    </AccountShell>
  );
}
