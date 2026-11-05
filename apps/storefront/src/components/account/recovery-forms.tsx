'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { MessageResponse } from '@repo/shared-types';
import { emailOnlySchema, passwordSchema, type EmailOnlyInput } from '@repo/validation';
import { z } from 'zod';
import { FormAlert, PasswordField, SubmitButton, TextField } from '@/components/forms/fields';
import { publicApi } from '@/lib/auth/auth-context';
import { applyApiError } from '@/lib/auth/form-errors';

export function ForgotPasswordForm() {
  const [error, setFormError] = useState('');
  const [message, setMessage] = useState('');
  const { register, handleSubmit, setError, formState } = useForm<EmailOnlyInput>({
    resolver: zodResolver(emailOnlySchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    try {
      const response = await publicApi.request<MessageResponse>('/auth/forgot-password', {
        method: 'POST',
        body: values,
      });
      setMessage(response.message);
    } catch (err) {
      setFormError(applyApiError(err, setError, ['email']));
    }
  });

  if (message) {
    return (
      <div className="space-y-4">
        <FormAlert tone="success">{message} The link expires in 1 hour.</FormAlert>
        <Link
          href="/account/login"
          className="block text-center text-sm font-semibold text-primary-600"
        >
          Back to sign in
        </Link>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert tone="error">{error}</FormAlert>
      <TextField
        label="Email address"
        type="email"
        autoComplete="email"
        error={formState.errors.email?.message}
        {...register('email')}
      />
      <SubmitButton pending={formState.isSubmitting}>Send reset link</SubmitButton>
    </form>
  );
}

const resetFormSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match", path: ['confirm'] });
type ResetForm = z.infer<typeof resetFormSchema>;

export function ResetPasswordForm() {
  const initialToken = useSearchParams().get('token');
  const [token] = useState(initialToken);
  const [error, setFormError] = useState(
    initialToken ? '' : 'This link is incomplete. Request a new one.',
  );
  const [done, setDone] = useState(false);
  const { register, handleSubmit, setError, formState } = useForm<ResetForm>({
    resolver: zodResolver(resetFormSchema),
  });

  useEffect(() => {
    // Keep the token in memory only; remove it from the address bar and history.
    if (initialToken) window.history.replaceState(null, '', '/account/reset-password');
  }, [initialToken]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    try {
      await publicApi.request('/auth/reset-password', {
        method: 'POST',
        body: { token, password: values.password },
      });
      setDone(true);
    } catch (err) {
      setFormError(applyApiError(err, setError, ['password']));
    }
  });

  if (done) {
    return (
      <div className="space-y-4">
        <FormAlert tone="success">
          Your password has been changed and you&apos;ve been signed out everywhere.
        </FormAlert>
        <Link
          href="/account/login"
          className="flex justify-center rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-button"
        >
          Sign in
        </Link>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert tone="error">
        {error}
        {error && (
          <>
            {' '}
            <Link href="/account/forgot-password" className="font-semibold underline">
              Request a new link
            </Link>
          </>
        )}
      </FormAlert>
      <PasswordField
        label="New password"
        autoComplete="new-password"
        hint="At least 12 characters."
        error={formState.errors.password?.message}
        {...register('password')}
      />
      <PasswordField
        label="Confirm new password"
        autoComplete="new-password"
        error={formState.errors.confirm?.message}
        {...register('confirm')}
      />
      <SubmitButton pending={formState.isSubmitting}>Change password</SubmitButton>
    </form>
  );
}
