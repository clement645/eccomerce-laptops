import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { AuthCard } from '@/components/account/auth-card';
import { LoginForm } from '@/components/account/login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to track orders, save addresses and check out faster."
      footer={
        <>
          New here?{' '}
          <Link href="/account/register" className="font-semibold text-primary-600">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
