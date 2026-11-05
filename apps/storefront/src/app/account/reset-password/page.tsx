import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard } from '@/components/account/auth-card';
import { ResetPasswordForm } from '@/components/account/recovery-forms';

export const metadata: Metadata = { title: 'Choose a new password' };

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Choose a new password"
      subtitle="You'll be signed out on all devices once it's changed."
    >
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
