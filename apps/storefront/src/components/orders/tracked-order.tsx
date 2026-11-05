'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { ApiError } from '@repo/api-client';
import type { OrderDetail } from '@repo/shared-types';
import { FormAlert } from '@/components/forms/fields';
import { publicApi } from '@/lib/auth/auth-context';
import { OrderView } from './order-view';

/**
 * Order looked up by its private tracking token. Polls while payment is pending.
 * `simulated` shows development buttons that stand in for the M-Pesa prompt.
 */
export function TrackedOrder({ token, simulated = false }: { token: string; simulated?: boolean }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['order-track', token],
    queryFn: () => publicApi.request<OrderDetail>(`/orders/track/${encodeURIComponent(token)}`),
    refetchInterval: (q) => (q.state.data?.paymentStatus === 'PENDING' ? 3000 : false),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
  const simulate = useMutation({
    mutationFn: (outcome: 'success' | 'failure') =>
      publicApi.request<OrderDetail>(
        `/checkout/orders/${encodeURIComponent(query.data!.orderNumber)}/simulate-payment`,
        {
          method: 'POST',
          body: { trackingToken: token, outcome },
          headers: { 'X-Requested-With': 'fetch' },
        },
      ),
    onSuccess: (order) => queryClient.setQueryData(['order-track', token], order),
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Could not update the payment'),
  });

  if (query.isPending) {
    return (
      <p role="status" className="flex items-center justify-center gap-2 py-16 text-ink-muted">
        <Loader2 aria-hidden className="size-5 animate-spin" /> Loading your order…
      </p>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="py-12 text-center">
        <h2 className="text-xl font-bold">We couldn&apos;t find that order</h2>
        <p className="mt-2 text-ink-muted">
          Check that you used the full link from your confirmation email.
        </p>
        <Link href="/" className="mt-6 inline-block font-semibold text-primary-600">
          Back to the store
        </Link>
      </div>
    );
  }
  return (
    <>
      {error && (
        <div className="mb-4">
          <FormAlert tone="error">{error}</FormAlert>
        </div>
      )}
      <OrderView
        order={query.data}
        refreshing={query.isFetching}
        simulating={simulate.isPending}
        onSimulate={
          simulated && query.data.paymentStatus === 'PENDING'
            ? (outcome) => simulate.mutate(outcome)
            : undefined
        }
      />
    </>
  );
}
