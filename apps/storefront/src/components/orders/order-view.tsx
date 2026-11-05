'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Package,
  RefreshCw,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { ApiError } from '@repo/api-client';
import type { OrderDetail } from '@repo/shared-types';
import { publicApi } from '@/lib/auth/auth-context';
import { DeviceArt } from '@/components/illustrations/device-art';
import { cn } from '@/lib/cn';
import { formatDate, formatKes, hashString } from '@/lib/format';
import { routes } from '@/lib/routes';

const FULFILLMENT_STEPS = ['PENDING', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED'] as const;
const STEP_LABEL: Record<string, string> = {
  PENDING: 'Order placed',
  PROCESSING: 'Processing',
  PACKED: 'Packed',
  SHIPPED: 'On the way',
  DELIVERED: 'Delivered',
};

function useCountdown(until: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  if (!until) return null;
  const remaining = Math.max(0, new Date(until).getTime() - now);
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function PaymentBanner({
  order,
  onSimulate,
  simulating,
}: {
  order: OrderDetail;
  onSimulate?: (outcome: 'success' | 'failure') => void;
  simulating: boolean;
}) {
  const countdown = useCountdown(order.paymentDueBy);
  if (order.paymentStatus === 'PENDING') {
    const mpesa = order.mpesa;
    const promptOpen = !mpesa || mpesa.status === 'PENDING' || mpesa.status === 'INITIATED';
    const reserved = countdown ? (
      <>
        {' '}
        for <strong className="tabular-nums">{countdown}</strong>
      </>
    ) : null;
    return (
      <div role="status" className="rounded-2xl border border-primary-100 bg-primary-50 p-5">
        {promptOpen ? (
          <>
            <p className="flex items-center gap-2 font-bold text-primary-800">
              <Smartphone aria-hidden className="size-5" /> Complete the M-Pesa payment on your
              phone
            </p>
            <p className="mt-1 text-sm text-primary-800/80">
              We sent a prompt{mpesa?.phoneMasked ? ` to ${mpesa.phoneMasked}` : ''}. Enter your
              M-Pesa PIN to pay {formatKes(order.totals.totalMinor)}. Your items are reserved
              {reserved}. This page updates automatically.
            </p>
          </>
        ) : (
          <>
            <p className="flex items-center gap-2 font-bold text-amber-900">
              <AlertTriangle aria-hidden className="size-5" /> Payment not completed yet
            </p>
            <p className="mt-1 text-sm text-amber-900/80">
              {mpesa.message ?? 'The M-Pesa payment was not completed.'} Your items are still
              reserved{reserved}.
            </p>
            {mpesa.canRetry ? (
              <RetryPrompt order={order} />
            ) : (
              <p className="mt-3 text-sm text-amber-900/80">
                {mpesa.attemptsLeft === 0
                  ? 'This order has reached the limit of payment attempts. Please contact us and quote your order number.'
                  : 'The time to pay for this order has ended.'}
              </p>
            )}
          </>
        )}
        {onSimulate && promptOpen && (
          <div className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-sm">
            <p className="font-semibold text-amber-900">
              Development mode: no real M-Pesa prompt is sent.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={simulating}
                onClick={() => onSimulate('success')}
                className="rounded-full bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
              >
                Simulate successful payment
              </button>
              <button
                type="button"
                disabled={simulating}
                onClick={() => onSimulate('failure')}
                className="rounded-full border border-red-300 bg-white px-4 py-2 font-semibold text-red-700 disabled:opacity-60"
              >
                Simulate cancelled prompt
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
  if (order.fulfillmentStatus === 'CANCELLED') {
    const reason = [...order.timeline].reverse().find((t) => t.status === 'CANCELLED')?.note;
    return (
      <div role="status" className="rounded-2xl border border-red-100 bg-red-50 p-5">
        <p className="flex items-center gap-2 font-bold text-red-800">
          <XCircle aria-hidden className="size-5" /> This order was cancelled
        </p>
        {reason && <p className="mt-1 text-sm text-red-800/80">{reason}</p>}
        <Link
          href={routes.shop}
          className="mt-3 inline-block text-sm font-semibold text-red-800 underline"
        >
          Continue shopping
        </Link>
      </div>
    );
  }
  return (
    <div role="status" className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
      <p className="flex items-center gap-2 font-bold text-emerald-800">
        <CheckCircle2 aria-hidden className="size-5" />
        {order.paymentStatus === 'PAID'
          ? 'Payment received. Thank you!'
          : 'Order confirmed. You will pay on delivery.'}
      </p>
      <p className="mt-1 text-sm text-emerald-800/80">
        We&apos;ve emailed a confirmation to {order.email}.
      </p>
    </div>
  );
}

/** Sends a new STK Push, optionally to a different number. Authorised by the order's tracking token. */
function RetryPrompt({ order }: { order: OrderDetail }) {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const retry = useMutation({
    mutationFn: () =>
      publicApi.request<OrderDetail>(
        `/checkout/orders/${encodeURIComponent(order.orderNumber)}/mpesa-retry`,
        {
          method: 'POST',
          body: { trackingToken: order.trackingToken, ...(phone.trim() ? { phone } : {}) },
          headers: { 'X-Requested-With': 'fetch' },
        },
      ),
    onSuccess: (updated) => {
      setError('');
      queryClient.setQueryData(['order-track', order.trackingToken], updated);
      void queryClient.invalidateQueries({ queryKey: ['my-order', order.orderNumber] });
    },
    onError: (err) =>
      setError(
        err instanceof ApiError && err.code === 'VALIDATION_FAILED'
          ? 'Enter a valid Kenyan mobile number, e.g. 0712 345 678'
          : err instanceof ApiError
            ? err.message
            : 'Could not send a new prompt. Please try again.',
      ),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    retry.mutate();
  };
  return (
    <form onSubmit={submit} className="mt-4 space-y-2" noValidate>
      <label htmlFor="retry-phone" className="block text-sm font-semibold text-ink">
        M-Pesa number <span className="font-normal text-ink-muted">(optional)</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="retry-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder={order.mpesa?.phoneMasked ?? '0712 345 678'}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'retry-error' : 'retry-hint'}
          className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
        <button
          type="submit"
          disabled={retry.isPending}
          className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-button transition hover:bg-primary-700 disabled:opacity-60"
        >
          {retry.isPending ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <RefreshCw aria-hidden className="size-4" />
          )}
          Send a new prompt
        </button>
      </div>
      {error ? (
        <p id="retry-error" className="text-sm text-danger">
          {error}
        </p>
      ) : (
        <p id="retry-hint" className="text-xs text-ink-muted">
          Leave blank to use the same number. {order.mpesa?.attemptsLeft} attempt
          {order.mpesa?.attemptsLeft === 1 ? '' : 's'} left.
        </p>
      )}
    </form>
  );
}

function Progress({ order }: { order: OrderDetail }) {
  if (order.fulfillmentStatus === 'CANCELLED') return null;
  const current = FULFILLMENT_STEPS.indexOf(
    order.fulfillmentStatus as (typeof FULFILLMENT_STEPS)[number],
  );
  return (
    <ol className="grid grid-cols-5 gap-2" aria-label="Delivery progress">
      {FULFILLMENT_STEPS.map((step, index) => (
        <li
          key={step}
          className="text-center"
          aria-current={index === current ? 'step' : undefined}
        >
          <span
            className={cn(
              'mx-auto block h-1.5 rounded-full',
              index <= current ? 'bg-primary-600' : 'bg-line',
            )}
          />
          <span
            className={cn(
              'mt-2 block text-[11px] font-semibold sm:text-xs',
              index <= current ? 'text-primary-700' : 'text-ink-subtle',
            )}
          >
            {STEP_LABEL[step]}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function OrderView({
  order,
  onSimulate,
  simulating = false,
  refreshing = false,
}: {
  order: OrderDetail;
  onSimulate?: (outcome: 'success' | 'failure') => void;
  simulating?: boolean;
  refreshing?: boolean;
}) {
  const a = order.shippingAddress;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-ink-muted">Order</p>
          <p className="font-display text-2xl font-extrabold">{order.orderNumber}</p>
        </div>
        <p className="flex items-center gap-1.5 text-sm text-ink-muted">
          {refreshing ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <Clock aria-hidden className="size-4" />
          )}
          Placed {formatDate(order.placedAt)}
        </p>
      </div>
      <PaymentBanner order={order} onSimulate={onSimulate} simulating={simulating} />
      <Progress order={order} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section aria-label="Items" className="rounded-2xl border border-line bg-white p-5">
          <ul className="divide-y divide-line">
            {order.lines.map((line) => (
              <li key={line.sku} className="flex gap-3 py-3">
                <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface-sunken">
                  {line.imageUrl ? (
                    <Image
                      src={line.imageUrl}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-contain p-1"
                    />
                  ) : (
                    <DeviceArt
                      kind={line.categorySlug ?? 'laptops'}
                      idPrefix={`order-${order.orderNumber}-${line.sku}`}
                      accent={hashString(line.sku)}
                      className="h-full w-full p-1"
                    />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {line.productSlug ? (
                      <Link
                        href={routes.product(line.productSlug)}
                        className="hover:text-primary-600"
                      >
                        {line.productName}
                      </Link>
                    ) : (
                      line.productName
                    )}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {line.variantName} · Qty {line.quantity} · {formatKes(line.unitPriceMinor)} each
                  </p>
                </div>
                <p className="text-sm font-bold">{formatKes(line.lineTotalMinor)}</p>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Subtotal</dt>
              <dd>{formatKes(order.totals.subtotalMinor)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-muted">Delivery</dt>
              <dd>
                {order.totals.shippingMinor === 0 ? 'Free' : formatKes(order.totals.shippingMinor)}
              </dd>
            </div>
            {order.totals.roundingMinor > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-muted">Rounding</dt>
                <dd>{formatKes(order.totals.roundingMinor)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-bold">
              <dt>Total</dt>
              <dd>{formatKes(order.totals.totalMinor)}</dd>
            </div>
            <div className="flex justify-between text-xs text-ink-subtle">
              <dt>Includes VAT</dt>
              <dd>{formatKes(order.totals.taxMinor)}</dd>
            </div>
          </dl>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-line bg-white p-5 text-sm">
            <h2 className="flex items-center gap-2 font-bold">
              <Package aria-hidden className="size-4 text-primary-600" /> Delivery
            </h2>
            <p className="mt-2 leading-6 text-ink-muted">
              {a.recipientName}
              <br />
              {[a.building, a.street].filter(Boolean).join(', ')}
              <br />
              {a.town}, {a.county}
              {a.landmark && (
                <>
                  <br />
                  Near {a.landmark}
                </>
              )}
            </p>
            {order.shippingMethodName && (
              <p className="mt-2 font-medium">{order.shippingMethodName}</p>
            )}
            {order.shipment?.trackingNumber && (
              <p className="mt-2">
                Tracking: <strong>{order.shipment.trackingNumber}</strong>
                {order.shipment.carrier && ` (${order.shipment.carrier})`}
              </p>
            )}
          </section>
          <section className="rounded-2xl border border-line bg-white p-5 text-sm">
            <h2 className="font-bold">Updates</h2>
            <ol className="mt-3 space-y-3">
              {[...order.timeline].reverse().map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="border-l-2 border-primary-100 pl-3">
                  <p className="font-medium">{entry.note ?? entry.status}</p>
                  <p className="text-xs text-ink-subtle">
                    {new Date(entry.at).toLocaleString('en-KE', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
