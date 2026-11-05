import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Cart, CartLine } from '@repo/shared-types';
import { renderWithProviders } from '../../../test/render';
import { useCartUi } from '@/lib/cart/cart-context';
import { AddToCartButton } from './add-to-cart-button';
import { CartLines } from './cart-lines';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}));

const line = (overrides: Partial<CartLine> = {}): CartLine => ({
  variantId: '01900000-0000-7000-8000-000000000001',
  productSlug: 'hp-elitebook',
  productName: 'HP EliteBook',
  variantName: 'Core i7',
  sku: 'HP-1',
  categorySlug: 'laptops',
  imageUrl: null,
  unitPriceMinor: 10_000_000,
  compareAtPriceMinor: null,
  quantity: 1,
  lineTotalMinor: 10_000_000,
  maxQuantity: 3,
  stockStatus: 'IN_STOCK',
  issue: null,
  ...overrides,
});

const cartJson = (lines: CartLine[]): Cart => ({
  id: 'c1',
  lines,
  itemCount: lines.length,
  subtotalMinor: 0,
  checkoutReady: true,
});

function DrawerState() {
  const { drawerOpen, notice } = useCartUi();
  return <p data-testid="drawer">{`${drawerOpen ? 'open' : 'closed'}|${notice ?? ''}`}</p>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('AddToCartButton', () => {
  it('adds the variant with the CSRF header and opens the cart', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(cartJson([line()])), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <AddToCartButton variantId="v-1" productName="HP EliteBook" outOfStock={false} />
        <DrawerState />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Add to Cart: HP EliteBook' }));
    await vi.waitFor(() => expect(screen.getByTestId('drawer')).toHaveTextContent('open|'));
    const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/cart/items'))!;
    expect(String(url)).toMatch(/\/cart\/items$/);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ variantId: 'v-1', quantity: 1 }));
    expect(new Headers(init.headers).get('X-Requested-With')).toBe('fetch');
    expect(init.credentials).toBe('include');
  });

  it('shows the reason when the item cannot be added', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'OUT_OF_STOCK', message: 'This item is out of stock' },
          }),
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <AddToCartButton variantId="v-1" productName="HP EliteBook" outOfStock={false} />
        <DrawerState />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Add to Cart: HP EliteBook' }));
    await vi.waitFor(() =>
      expect(screen.getByTestId('drawer')).toHaveTextContent('open|This item is out of stock'),
    );
  });

  it('is disabled when out of stock', () => {
    renderWithProviders(<AddToCartButton variantId="v-1" productName="HP EliteBook" outOfStock />);
    expect(screen.getByRole('button', { name: 'Out of stock: HP EliteBook' })).toBeDisabled();
  });
});

describe('CartLines', () => {
  it('limits quantity to what is available and explains problems', () => {
    renderWithProviders(
      <CartLines
        lines={[
          line({ quantity: 3 }),
          line({ variantId: 'v2', sku: 'X', issue: 'OUT_OF_STOCK', maxQuantity: 0 }),
        ]}
      />,
    );
    const increase = screen.getAllByRole('button', { name: 'Increase quantity' });
    expect(increase[0]).toBeDisabled();
    expect(screen.getByText('Out of stock. Remove it to continue.')).toBeInTheDocument();
  });
});
