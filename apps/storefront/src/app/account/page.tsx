import { AccountShell } from '@/components/account/account-shell';
import { ChangePasswordPanel, ProfilePanel } from '@/components/account/profile-panels';

export default function AccountPage() {
  return (
    <AccountShell title="My account">
      <ProfilePanel />
      <ChangePasswordPanel />
    </AccountShell>
  );
}
