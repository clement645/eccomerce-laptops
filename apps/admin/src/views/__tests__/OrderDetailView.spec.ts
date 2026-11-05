import { flushPromises, mount } from '@vue/test-utils';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminOrderDetail, Permission } from '@repo/shared-types';
import { useAuthStore } from '@/stores/auth';
import OrderDetailView from '../orders/OrderDetailView.vue';

const order = (overrides: Partial<AdminOrderDetail> = {}): AdminOrderDetail => ({
  id: 'o1',
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
  paymentStatus: 'PAID',
  fulfillmentStatus: 'PENDING',
  paymentDueBy: null,
  mpesa: null,
  lines: [
    {
      productSlug: 'hp',
      productName: 'HP EliteBook',
      variantName: 'i7',
      sku: 'HP-1',
      imageUrl: null,
      categorySlug: 'laptops',
      unitPriceMinor: 10_000_000,
      quantity: 1,
      lineTotalMinor: 10_000_000,
    },
  ],
  totals: {
    subtotalMinor: 10_000_000,
    discountMinor: 0,
    shippingMinor: 0,
    taxMinor: 1_379_310,
    roundingMinor: 0,
    totalMinor: 10_000_000,
  },
  shipment: null,
  userId: null,
  customerNote: null,
  internalNote: null,
  history: [],
  payments: [],
  shipments: [],
  allowedTransitions: ['PROCESSING'],
  canRecordCashPayment: false,
  ...overrides,
});

async function render(permissions: Permission[], fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock);
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.user = { id: 'staff', email: 'staff@example.com', name: 'Staff', roles: ['X'], permissions };
  auth.status = 'authenticated';
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/orders/:orderNumber', name: 'order', component: OrderDetailView },
      { path: '/orders', name: 'orders', component: { template: '<p />' } },
      { path: '/customers/:id', name: 'customer', component: { template: '<p />' } },
    ],
  });
  await router.push('/orders/EL-2026-001234');
  const wrapper = mount(OrderDetailView, {
    global: {
      plugins: [
        router,
        [
          VueQueryPlugin,
          { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        ],
      ],
    },
  });
  await flushPromises();
  return wrapper;
}

const json = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
afterEach(() => vi.unstubAllGlobals());

describe('OrderDetailView', () => {
  it('offers only the next allowed step and sends it', async () => {
    const fetchMock = vi.fn((url: URL, init?: RequestInit) =>
      init?.method === 'POST'
        ? json(order({ fulfillmentStatus: 'PROCESSING', allowedTransitions: ['PACKED'] }))
        : json(order()),
    );
    const wrapper = await render(['orders:read', 'orders:update', 'orders:cancel'], fetchMock);
    const buttons = wrapper.findAll('button').map((b) => b.text());
    expect(buttons).toContain('Start processing');
    expect(buttons).not.toContain('Mark as packed');
    expect(buttons).toContain('Cancel order');

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Start processing')!
      .trigger('click');
    await flushPromises();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(String(post[0])).toContain('/admin/orders/EL-2026-001234/transitions');
    expect(JSON.parse(post[1]!.body as string)).toEqual({ to: 'PROCESSING' });
    expect(wrapper.text()).toContain('Mark as packed');
  });

  it('shows no actions to read-only staff', async () => {
    const wrapper = await render(
      ['orders:read'],
      vi.fn(() => json(order())),
    );
    const buttons = wrapper.findAll('button').map((b) => b.text());
    expect(buttons).not.toContain('Start processing');
    expect(buttons).not.toContain('Cancel order');
    expect(wrapper.find('#internal-note').attributes('disabled')).toBeDefined();
  });

  it('explains why an unpaid M-Pesa order cannot be fulfilled yet', async () => {
    const wrapper = await render(
      ['orders:read', 'orders:update'],
      vi.fn(() => json(order({ paymentStatus: 'PENDING', allowedTransitions: [] }))),
    );
    expect(wrapper.text()).toMatch(/Waiting for the customer's M-Pesa payment/);
  });
});
