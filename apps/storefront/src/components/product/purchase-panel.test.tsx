import { screen } from '@testing-library/react';
import { renderWithProviders as render } from '../../../test/render';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProductVariantDetail } from '@repo/shared-types';
import { PurchasePanel } from './purchase-panel';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const variant = (overrides: Partial<ProductVariantDetail>): ProductVariantDetail => ({
  id: 'v1',
  sku: 'SKU-1',
  name: 'Core i5 / 8GB',
  priceMinor: 10_999_900,
  compareAtPriceMinor: null,
  discountPercent: 0,
  attributes: {},
  stockStatus: 'IN_STOCK',
  maxQuantity: 10,
  isDefault: true,
  ...overrides,
});

const variants = [
  variant({}),
  variant({
    id: 'v2',
    sku: 'SKU-2',
    name: 'Core i5 / 16GB',
    priceMinor: 12_999_900,
    compareAtPriceMinor: 13_999_900,
    discountPercent: 7,
    stockStatus: 'LOW_STOCK',
    maxQuantity: 2,
    isDefault: false,
  }),
];

describe('PurchasePanel', () => {
  it('switches price and stock with the selected configuration and updates the URL', async () => {
    const user = userEvent.setup();
    render(<PurchasePanel variants={variants} />);
    expect(screen.getByText(/109,999/, { selector: 'p' })).toBeInTheDocument();
    await user.click(screen.getByLabelText(/Core i5 \/ 16GB/));
    expect(screen.getByText(/129,999/, { selector: 'p[aria-live]' })).toBeInTheDocument();
    expect(screen.getByText('Only 2 left in stock')).toBeInTheDocument();
    expect(screen.getByText(/Save/)).toHaveTextContent('7%');
    expect(window.location.search).toBe('?variant=SKU-2');
  });

  it('starts on the variant from the URL', () => {
    render(<PurchasePanel variants={variants} initialSku="SKU-2" />);
    expect(screen.getByLabelText(/Core i5 \/ 16GB/)).toBeChecked();
  });

  it('limits quantity to available stock', async () => {
    const user = userEvent.setup();
    render(<PurchasePanel variants={variants} initialSku="SKU-2" />);
    const increase = screen.getByRole('button', { name: 'Increase quantity' });
    await user.click(increase);
    await user.click(increase);
    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toHaveValue(2);
    expect(increase).toBeDisabled();
  });

  it('blocks buying when out of stock', () => {
    render(<PurchasePanel variants={[variant({ stockStatus: 'OUT_OF_STOCK', maxQuantity: 0 })]} />);
    expect(screen.getByRole('button', { name: /Out of stock/ })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toBeDisabled();
  });
});
