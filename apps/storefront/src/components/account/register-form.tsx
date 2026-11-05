'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import type { MessageResponse } from '@repo/shared-types';
import { registerSchema } from '@repo/validation';
import type { z } from 'zod';
import {
  Checkbox,
  FormAlert,
  PasswordField,
  SubmitButton,
  TextField,
} from '@/components/forms/fields';
import { publicApi } from '@/lib/auth/auth-context';
import { applyApiError } from '@/lib/auth/form-errors';

type RegisterForm = z.input<typeof registerSchema>;

export function RegisterForm() {
  const [error, setFormError] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { marketingOptIn: false },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    try {
      await publicApi.request<MessageResponse>('/auth/register', { method: 'POST', body: values });
      setSentTo(values.email);
    } catch (err) {
      setFormError(applyApiError(err, setError, ['email', 'password', 'firstName', 'lastName']));
    }
  });

  if (sentTo) {
    return (
      <div className="text-center" role="status">
        <MailCheck aria-hidden className="mx-auto size-12 text-primary-600" />
        <h2 className="mt-4 text-lg font-bold">Check your inbox</h2>
        <p className="mt-2 text-sm text-ink-muted">
          If <strong className="text-ink">{sentTo}</strong> can be used, we&apos;ve sent a link to
          confirm it. The link expires in 24 hours.
        </p>
        <Link
          href="/account/login"
          className="mt-6 inline-block text-sm font-semibold text-primary-600"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert tone="error">{error}</FormAlert>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="First name"
          autoComplete="given-name"
          error={formState.errors.firstName?.message}
          {...register('firstName')}
        />
        <TextField
          label="Last name"
          autoComplete="family-name"
          error={formState.errors.lastName?.message}
          {...register('lastName')}
        />
      </div>
      <TextField
        label="Email address"
        type="email"
        autoComplete="email"
        error={formState.errors.email?.message}
        {...register('email')}
      />
      <PasswordField
        label="Password"
        autoComplete="new-password"
        hint="At least 12 characters. A short phrase is easy to remember and hard to guess."
        error={formState.errors.password?.message}
        {...register('password')}
      />
      <Checkbox
        label="Send me new arrivals, buying guides and offers. You can unsubscribe at any time."
        {...register('marketingOptIn')}
      />
      <SubmitButton pending={formState.isSubmitting}>Create account</SubmitButton>
    </form>
  );
}
