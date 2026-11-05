import { screen } from '@testing-library/react';
import { renderWithProviders as render } from '../../../test/render';
import { describe, expect, it } from 'vitest';
import { productFixture } from '../../../test/fixtures';
import { ProductCard } from './product-card';

describe('ProductCard', () => {
  it('shows name, brand, KES price and links to the product page', () => {
    render(<ProductCard product={productFixture()} />);
    expect(screen.getByRole('link', { name: 'HP EliteBook 840 G10' })).toHaveAttribute(
      'href',
      '/products/hp-elitebook-840-g10',
    );
    expect(screen.getByText('HP')).toBeInTheDocument();
    expect(screen.getByText(/189,999/)).toBeInTheDocument();
  });

  it('never shows stars without real reviews', () => {
    render(<ProductCard product={productFixture({ rating: null })} />);
    expect(screen.getByText('No reviews yet')).toBeInTheDocument();
    expect(screen.queryByText(/Rated/)).not.toBeInTheDocument();
  });

  it('shows the rating when approved reviews exist', () => {
    render(<ProductCard product={productFixture({ rating: { average: 4.5, count: 12 } })} />);
    expect(screen.getByText(/Rated 4.5 out of 5/)).toBeInTheDocument();
    expect(screen.getByText('(12)')).toBeInTheDocument();
  });

  it('shows the previous price and discount badge for sale items', () => {
    render(
      <ProductCard
        product={productFixture({
          compareAtPriceMinor: 21_499_900,
          discountPercent: 12,
          isNew: true,
        })}
      />,
    );
    expect(screen.getByText('-12%')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText(/214,999/)).toHaveClass('line-through');
  });

  it('prefixes "From" when variants have different prices', () => {
    render(<ProductCard product={productFixture({ hasPriceRange: true })} />);
    expect(screen.getByText('From')).toBeInTheDocument();
  });

  it('marks out-of-stock products and disables buying', () => {
    render(<ProductCard product={productFixture({ stockStatus: 'OUT_OF_STOCK' })} />);
    const button = screen.getByRole('button', { name: /out of stock/i });
    expect(button).toBeDisabled();
  });

  it('warns when stock is low', () => {
    render(<ProductCard product={productFixture({ stockStatus: 'LOW_STOCK' })} />);
    expect(screen.getByText('Only a few left')).toBeInTheDocument();
  });

  it('labels refurbished products', () => {
    render(<ProductCard product={productFixture({ condition: 'REFURBISHED' })} />);
    expect(screen.getByText('Refurbished')).toBeInTheDocument();
  });
});
