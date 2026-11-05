'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2, Package } from 'lucide-react';
import type { OrderDetail, OrderSummary } from '@repo/shared-types';
import { OrderView } from '@/components/orders/order-view';
import { useAuth } from '@/lib/auth/auth-context';
import { formatDate, formatKes } from '@/lib/format';
import { routes } from '@/lib/routes';
import { Panel } from './account-shell';

const STATUS: Record<string, string> = {
  PENDING: 'Order placed',
  PROCESSING: 'Processing',
  PACKED: 'Packed',
  SHIPPED: 'On the way',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export function OrdersPanel() {
  const { request, user } = useAuth();
  const orders = useQuery({
    queryKey: ['my-orders', user?.id],
    queryFn: () => request<OrderSummary[]>('/orders'),
  });
  return (
    <Panel title="Your orders">
      {orders.isPending ? (
        <p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 aria-hidden className="size-4 animate-spin" /> Loading…
        </p>
      ) : !orders.data?.length ? (
        <div className="py-8 text-center">
          <Package aria-hidden className="mx-auto size-10 text-primary-300" />
          <p className="mt-3 font-semibold">No orders yet</p>
          <Link
            href={routes.shop}
            className="mt-4 inline-block text-sm font-semibold text-primary-600"
          >
            Start shopping
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {orders.data.map((order) => (
            <li key={order.orderNumber}>
              <Link
                href={`/account/orders/${order.orderNumber}`}
                className="flex items-center gap-3 py-3 hover:text-primary-700"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{order.orderNumber}</p>
                  <p className="text-xs text-ink-muted">
                    {formatDate(order.placedAt)} · {order.itemCount}{' '}
                    {order.itemCount === 1 ? 'item' : 'items'} ·{' '}
                    {order.paymentStatus === 'PENDING'
                      ? 'Awaiting payment'
                      : STATUS[order.fulfillmentStatus]}
                  </p>
                </div>
                <span className="font-bold">{formatKes(order.totalMinor)}</span>
                <ChevronRight aria-hidden className="size-4 text-ink-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function OrderDetailPanel({ orderNumber }: { orderNumber: string }) {
  const { request } = useAuth();
  const order = useQuery({
    queryKey: ['my-order', orderNumber],
    queryFn: () => request<OrderDetail>(`/orders/${encodeURIComponent(orderNumber)}`),
    refetchInterval: (q) => (q.state.data?.paymentStatus === 'PENDING' ? 3000 : false),
  });
  if (order.isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
        <Loader2 aria-hidden className="size-4 animate-spin" /> Loading…
      </p>
    );
  }
  if (!order.data) return <p className="text-ink-muted">We couldn&apos;t find that order.</p>;
  return <OrderView order={order.data} refreshing={order.isFetching} />;
}
