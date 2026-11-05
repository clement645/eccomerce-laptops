import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/account/auth-card';
import { RegisterForm } from '@/components/account/register-form';

export const metadata: Metadata = { title: 'Create an account' };

export default function RegisterPage() {
  return (
    <AuthCard
      title="Create your account"
      subtitle="Faster checkout, order tracking and saved addresses."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/account/login" className="font-semibold text-primary-600">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
