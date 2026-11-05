import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/account/auth-card';
import { ForgotPasswordForm } from '@/components/account/recovery-forms';

export const metadata: Metadata = { title: 'Forgot your password' };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a link to choose a new one."
      footer={
        <Link href="/account/login" className="font-semibold text-primary-600">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
