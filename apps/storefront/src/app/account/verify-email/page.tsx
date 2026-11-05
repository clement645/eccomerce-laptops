import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard } from '@/components/account/auth-card';
import { VerifyEmail } from '@/components/account/verify-email';

export const metadata: Metadata = { title: 'Confirm your email' };

export default function VerifyEmailPage() {
  return (
    <AuthCard title="Confirm your email">
      <Suspense>
        <VerifyEmail />
      </Suspense>
    </AuthCard>
  );
}
