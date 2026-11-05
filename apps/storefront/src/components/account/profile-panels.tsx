'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { MessageResponse, SessionUser } from '@repo/shared-types';
import {
  changePasswordSchema,
  profileUpdateSchema,
  type ChangePasswordInput,
  type ProfileUpdateInput,
} from '@repo/validation';
import {
  Checkbox,
  FormAlert,
  PasswordField,
  SubmitButton,
  TextField,
} from '@/components/forms/fields';
import { useAuth } from '@/lib/auth/auth-context';
import { applyApiError } from '@/lib/auth/form-errors';
import { Panel } from './account-shell';

export function ProfilePanel() {
  const { user, request, setUser } = useAuth();
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<ProfileUpdateInput>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      phone: user?.phone ? `0${user.phone.slice(3)}` : '',
      marketingOptIn: user?.marketingOptIn ?? false,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setMessage(null);
    try {
      setUser(await request<SessionUser>('/account/profile', { method: 'PATCH', body: values }));
      setMessage({ tone: 'success', text: 'Profile saved.' });
    } catch (err) {
      const text = applyApiError(err, setError, ['firstName', 'lastName', 'phone']);
      if (text) setMessage({ tone: 'error', text });
    }
  });

  return (
    <Panel title="Personal details" description={`Signed in as ${user?.email ?? ''}`}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {message && <FormAlert tone={message.tone}>{message.text}</FormAlert>}
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
          label="Mobile number"
          type="tel"
          autoComplete="tel"
          placeholder="0712 345 678"
          hint="Used for delivery updates and M-Pesa payments."
          error={formState.errors.phone?.message}
          {...register('phone')}
        />
        <Checkbox
          label="Email me new arrivals, buying guides and offers."
          {...register('marketingOptIn')}
        />
        <SubmitButton pending={formState.isSubmitting} className="sm:w-auto">
          Save changes
        </SubmitButton>
      </form>
    </Panel>
  );
}

export function ChangePasswordPanel() {
  const { request } = useAuth();
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const { register, handleSubmit, setError, reset, formState } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setMessage(null);
    try {
      const response = await request<MessageResponse>('/account/change-password', {
        method: 'POST',
        body: values,
      });
      reset();
      setMessage({ tone: 'success', text: response.message });
    } catch (err) {
      const text = applyApiError(err, setError, ['currentPassword', 'newPassword']);
      if (text) setMessage({ tone: 'error', text });
    }
  });

  return (
    <Panel title="Password" description="Changing your password signs you out on other devices.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {message && <FormAlert tone={message.tone}>{message.text}</FormAlert>}
        <PasswordField
          label="Current password"
          autoComplete="current-password"
          error={formState.errors.currentPassword?.message}
          {...register('currentPassword')}
        />
        <PasswordField
          label="New password"
          autoComplete="new-password"
          hint="At least 12 characters."
          error={formState.errors.newPassword?.message}
          {...register('newPassword')}
        />
        <SubmitButton pending={formState.isSubmitting} className="sm:w-auto">
          Change password
        </SubmitButton>
      </form>
    </Panel>
  );
}
