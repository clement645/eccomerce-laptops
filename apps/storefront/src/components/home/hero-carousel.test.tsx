import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { bannerFixture } from '../../../test/fixtures';
import { HeroCarousel } from './hero-carousel';

describe('HeroCarousel', () => {
  it('renders the slide content and calls to action', () => {
    render(<HeroCarousel slides={[bannerFixture()]} />);
    expect(screen.getByRole('heading', { name: 'Your Perfect Tech Partner' })).toBeInTheDocument();
    expect(screen.getByText('Tech Partner')).toHaveClass('text-gradient-light');
    expect(screen.getByRole('link', { name: /Shop Now/ })).toHaveAttribute('href', '/shop');
    expect(screen.getByText('Top Brands')).toBeInTheDocument();
    // A single slide needs no carousel controls.
    expect(screen.queryByRole('button', { name: 'Next slide' })).not.toBeInTheDocument();
  });

  it('moves between slides with accessible controls', async () => {
    const user = userEvent.setup();
    render(
      <HeroCarousel
        slides={[
          bannerFixture(),
          bannerFixture({ id: 'b2', title: 'Laptops That Mean Business', titleHighlight: null }),
        ]}
      />,
    );
    expect(screen.getByRole('group', { name: '1 of 2' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(
      await screen.findByRole('heading', { name: 'Laptops That Mean Business' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to slide 2' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });
});
