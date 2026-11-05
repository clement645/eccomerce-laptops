'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError } from '@repo/api-client';
import type { AuthResponse } from '@repo/shared-types';
import { loginSchema, type LoginInput } from '@repo/validation';
import { FormAlert, PasswordField, SubmitButton, TextField } from '@/components/forms/fields';
import { publicApi, useAuth } from '@/lib/auth/auth-context';
import { applyApiError } from '@/lib/auth/form-errors';
import { safeNext } from '@/lib/auth/safe-next';

export function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const { status, signIn } = useAuth();
  const [error, setFormError] = useState('');
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const { register, handleSubmit, setError, formState } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  useEffect(() => {
    if (status === 'authenticated') router.replace(next);
  }, [status, next, router]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    setUnverifiedEmail(null);
    try {
      const response = await publicApi.request<AuthResponse>('/auth/login', {
        method: 'POST',
        body: values,
      });
      signIn(response);
      router.replace(next);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(values.email);
        return;
      }
      setFormError(applyApiError(err, setError, ['email', 'password']));
    }
  });

  const resend = async () => {
    if (!unverifiedEmail) return;
    await publicApi
      .request('/auth/resend-verification', { method: 'POST', body: { email: unverifiedEmail } })
      .catch(() => undefined);
    setResent(true);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert tone="error">{error}</FormAlert>
      {unverifiedEmail && (
        <FormAlert tone="info">
          Please confirm your email address first. Check your inbox for the link.{' '}
          {resent ? (
            <strong>We&apos;ve sent a new link.</strong>
          ) : (
            <button type="button" onClick={resend} className="font-semibold underline">
              Send a new link
            </button>
          )}
        </FormAlert>
      )}
      <TextField
        label="Email address"
        type="email"
        autoComplete="email"
        error={formState.errors.email?.message}
        {...register('email')}
      />
      <PasswordField
        label="Password"
        autoComplete="current-password"
        error={formState.errors.password?.message}
        {...register('password')}
      />
      <div className="text-right">
        <Link
          href="/account/forgot-password"
          className="text-sm font-semibold text-primary-600 hover:text-primary-700"
        >
          Forgot your password?
        </Link>
      </div>
      <SubmitButton pending={formState.isSubmitting}>Sign in</SubmitButton>
    </form>
  );
}
