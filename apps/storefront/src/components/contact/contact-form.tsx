'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { contactMessageSchema, type ContactMessageInput } from '@repo/validation';
import { FormAlert, SubmitButton, TextAreaField, TextField } from '@/components/forms/fields';
import { publicApi } from '@/lib/auth/auth-context';
import { applyApiError } from '@/lib/auth/form-errors';

type ContactForm = {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  website?: string;
};

export function ContactForm() {
  const [error, setError] = useState('');
  const form = useForm<ContactForm>({
    resolver: zodResolver(contactMessageSchema) as never,
    defaultValues: { name: '', email: '', phone: '', subject: '', message: '', website: '' },
  });
  const send = useMutation({
    mutationFn: (values: ContactMessageInput) =>
      publicApi.request<{ message: string }>('/contact', { method: 'POST', body: values }),
    onError: (e) =>
      setError(applyApiError(e, form.setError, ['name', 'email', 'phone', 'subject', 'message'])),
  });
  const errors = form.formState.errors;

  if (send.isSuccess)
    return (
      <FormAlert tone="success">
        Thanks, we&apos;ve received your message. We usually reply by email within one working day.
      </FormAlert>
    );

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        setError('');
        send.mutate(values as unknown as ContactMessageInput);
      })}
    >
      {error && <FormAlert tone="error">{error}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Your name"
          autoComplete="name"
          {...form.register('name')}
          error={errors.name?.message}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          {...form.register('email')}
          error={errors.email?.message}
        />
      </div>
      <TextField
        label="Phone (optional)"
        type="tel"
        autoComplete="tel"
        hint="If you'd like us to call you back."
        {...form.register('phone')}
        error={errors.phone?.message}
      />
      <TextField label="Subject" {...form.register('subject')} error={errors.subject?.message} />
      <TextAreaField
        label="Message"
        rows={6}
        maxLength={5000}
        {...form.register('message')}
        error={errors.message?.message}
      />
      {/* Hidden from people; bots tend to fill it in. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" tabIndex={-1} autoComplete="off" {...form.register('website')} />
      </div>
      <SubmitButton pending={send.isPending} className="sm:w-auto">
        Send message
      </SubmitButton>
    </form>
  );
}
