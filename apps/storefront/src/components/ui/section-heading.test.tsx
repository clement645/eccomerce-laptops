import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SectionHeading } from './section-heading';

describe('SectionHeading', () => {
  it('renders the highlighted part with the gradient', () => {
    render(<SectionHeading title="Shop by Category" highlight="Category" />);
    expect(screen.getByRole('heading', { name: 'Shop by Category' })).toBeInTheDocument();
    expect(screen.getByText('Category')).toHaveClass('text-gradient');
  });

  it('falls back to plain text when the highlight is not in the title', () => {
    render(<SectionHeading title="New Arrivals" highlight="Missing" />);
    expect(screen.getByRole('heading')).toHaveTextContent('New Arrivals');
  });

  it('renders the "View All" action link', () => {
    render(<SectionHeading title="Deals" action={{ label: 'View All', href: '/deals' }} />);
    expect(screen.getByRole('link', { name: 'View All' })).toHaveAttribute('href', '/deals');
  });
});
