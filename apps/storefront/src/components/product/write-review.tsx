'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import type { ReviewEligibility } from '@repo/shared-types';
import { reviewInputSchema, type ReviewInput } from '@repo/validation';
import type { z } from 'zod';
import { FormAlert, SubmitButton, TextAreaField, TextField } from '@/components/forms/fields';
import { useAuth } from '@/lib/auth/auth-context';
import { applyApiError } from '@/lib/auth/form-errors';
import { cn } from '@/lib/cn';

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/**
 * Review form for customers who received the product. Reviews appear after moderation, so a
 * submission shows a thank-you rather than the review itself.
 */
export function WriteReview({ productSlug }: { productSlug: string }) {
  const { status, request } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const key = ['review-eligibility', productSlug];
  const eligibility = useQuery({
    queryKey: key,
    queryFn: () =>
      request<ReviewEligibility>(`/account/reviews/${encodeURIComponent(productSlug)}`),
    enabled: status === 'authenticated',
  });
  const existing = eligibility.data?.existing;
  const form = useForm<z.input<typeof reviewInputSchema>, unknown, ReviewInput>({
    resolver: zodResolver(reviewInputSchema),
    values: existing
      ? { rating: existing.rating, title: existing.title, body: existing.body }
      : undefined,
    defaultValues: { rating: 0, title: '', body: '' },
  });
  const rating = useWatch({ control: form.control, name: 'rating' });
  const submit = useMutation({
    mutationFn: (input: ReviewInput) =>
      request<ReviewEligibility>(`/account/reviews/${encodeURIComponent(productSlug)}`, {
        method: 'PUT',
        body: input,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      setOpen(false);
      setMessage('Thanks! Your review will appear here once our team has checked it.');
    },
    onError: (error) =>
      setMessage(applyApiError(error, form.setError, ['rating', 'title', 'body'])),
  });

  if (status === 'loading') return null;
  if (status !== 'authenticated')
    return (
      <p className="mt-6 text-sm text-ink-muted">
        Bought this product?{' '}
        <Link
          href={`/account/login?next=${encodeURIComponent(`/products/${productSlug}#reviews`)}`}
          className="font-semibold text-primary-600 hover:underline"
        >
          Sign in to write a review
        </Link>
        .
      </p>
    );
  if (!eligibility.data) return null;
  if (!eligibility.data.canReview)
    return (
      <p className="mt-6 text-sm text-ink-muted">
        You can review this product once an order containing it has been delivered to you.
      </p>
    );

  return (
    <div className="mt-6 rounded-2xl border border-line p-5">
      {message && !open && (
        <FormAlert tone={submit.isError ? 'error' : 'success'}>{message}</FormAlert>
      )}
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            {existing
              ? existing.status === 'PENDING'
                ? 'Your review is waiting to be checked.'
                : existing.status === 'REJECTED'
                  ? "Your review wasn't published. You can edit it and send it again."
                  : 'Thanks for reviewing this product.'
              : 'You bought this product. Tell other shoppers what you think.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setMessage('');
            }}
            className="rounded-full border-2 border-primary-600 px-5 py-2 text-sm font-semibold text-primary-600 hover:bg-primary-50"
          >
            {existing ? 'Edit your review' : 'Write a review'}
          </button>
        </div>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={form.handleSubmit((v) => submit.mutate(v))}
        >
          {message && <FormAlert tone="error">{message}</FormAlert>}
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-ink">Your rating</legend>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="cursor-pointer">
                  <input
                    type="radio"
                    value={n}
                    className="peer sr-only"
                    checked={rating === n}
                    onChange={() => form.setValue('rating', n, { shouldValidate: true })}
                  />
                  <span className="sr-only">
                    {n} star{n === 1 ? '' : 's'} ({LABELS[n]})
                  </span>
                  <Star
                    aria-hidden
                    className={cn(
                      'size-7 rounded transition peer-focus-visible:ring-2 peer-focus-visible:ring-primary-400',
                      n <= rating
                        ? 'fill-amber-400 text-amber-400'
                        : 'fill-line text-line hover:text-amber-300',
                    )}
                  />
                </label>
              ))}
              <span className="ml-2 text-sm text-ink-muted" aria-live="polite">
                {LABELS[rating] ?? ''}
              </span>
            </div>
            {form.formState.errors.rating && (
              <p className="mt-1.5 text-xs font-medium text-danger">
                {form.formState.errors.rating.message}
              </p>
            )}
          </fieldset>
          <TextField
            label="Title (optional)"
            maxLength={120}
            {...form.register('title')}
            error={form.formState.errors.title?.message}
          />
          <TextAreaField
            label="Your review"
            rows={5}
            maxLength={3000}
            hint="What did you like or not like? How do you use it?"
            {...form.register('body')}
            error={form.formState.errors.body?.message}
          />
          <div className="flex flex-wrap gap-3">
            <SubmitButton pending={submit.isPending} className="w-auto">
              Submit review
            </SubmitButton>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full px-5 py-2 text-sm font-semibold text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-ink-subtle">
            Only your first name and last initial are shown.
          </p>
        </form>
      )}
    </div>
  );
}
