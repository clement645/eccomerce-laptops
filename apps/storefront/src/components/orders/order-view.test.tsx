import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MpesaPaymentState, OrderDetail } from '@repo/shared-types';
import { renderWithProviders } from '../../../test/render';
import { OrderView } from './order-view';

const order = (mpesa: MpesaPaymentState | null): OrderDetail => ({
  orderNumber: 'EL-2026-001234',
  trackingToken: 't'.repeat(43),
  placedAt: '2026-10-30T09:00:00.000Z',
  email: 'amina@example.com',
  customerName: 'Amina Otieno',
  phone: '254712345678',
  shippingAddress: {
    recipientName: 'Amina Otieno',
    county: 'Nairobi',
    town: 'Kilimani',
    street: 'Argwings Kodhek Road',
    building: null,
    landmark: null,
  },
  shippingMethodName: 'Standard delivery',
  paymentProvider: 'MPESA',
  paymentStatus: 'PENDING',
  fulfillmentStatus: 'PENDING',
  paymentDueBy: new Date(Date.now() + 10 * 60_000).toISOString(),
  mpesa,
  lines: [],
  totals: {
    subtotalMinor: 1_000_000,
    discountMinor: 0,
    shippingMinor: 0,
    taxMinor: 137_931,
    roundingMinor: 0,
    totalMinor: 1_000_000,
  },
  timeline: [],
  shipment: null,
});

const cancelled: MpesaPaymentState = {
  status: 'CANCELLED',
  phoneMasked: '2547******78',
  message: 'The M-Pesa prompt was cancelled.',
  attemptsLeft: 2,
  canRetry: true,
};

afterEach(() => vi.unstubAllGlobals());

describe('OrderView payment banner', () => {
  it('asks the customer to check their phone while a prompt is open', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    renderWithProviders(
      <OrderView
        order={order({ ...cancelled, status: 'PENDING', message: null, canRetry: false })}
      />,
    );
    expect(screen.getByText(/Complete the M-Pesa payment/)).toBeInTheDocument();
    expect(screen.getByText(/sent a prompt to 2547\*\*\*\*\*\*78/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new prompt/i })).not.toBeInTheDocument();
  });

  it('explains a cancelled prompt and sends a new one to another number', async () => {
    const fetchMock = vi.fn((url: string | URL) =>
      Promise.resolve(
        String(url).includes('/mpesa-retry')
          ? new Response(
              JSON.stringify(
                order({ ...cancelled, status: 'PENDING', message: null, canRetry: false }),
              ),
              { status: 200 },
            )
          : new Response('{}', { status: 401 }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithProviders(<OrderView order={order(cancelled)} />);

    expect(screen.getByText(/The M-Pesa prompt was cancelled/)).toBeInTheDocument();
    expect(screen.getByText(/2 attempts left/)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/M-Pesa number/), '0711 000 111');
    await user.click(screen.getByRole('button', { name: /send a new prompt/i }));

    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/mpesa-retry')) as
      [URL, RequestInit] | undefined;
    expect(String(call?.[0])).toContain('/checkout/orders/EL-2026-001234/mpesa-retry');
    expect(new Headers(call?.[1].headers).get('X-Requested-With')).toBe('fetch');
    expect(JSON.parse(call?.[1].body as string)).toEqual({
      trackingToken: 't'.repeat(43),
      phone: '0711 000 111',
    });
  });

  it('points to support once the attempts are used up', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    renderWithProviders(
      <OrderView order={order({ ...cancelled, attemptsLeft: 0, canRetry: false })} />,
    );
    expect(screen.getByText(/limit of payment attempts/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new prompt/i })).not.toBeInTheDocument();
  });
});
