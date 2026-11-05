import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatsBanner } from './stats-banner';

describe('StatsBanner', () => {
  it('shows real store figures and no rating without reviews', () => {
    render(
      <StatsBanner
        stats={{ productCount: 22, brandCount: 10, countiesServed: 47, reviews: null }}
      />,
    );
    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.getByText('47')).toBeInTheDocument();
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
  });

  it('adds the average rating once reviews exist', () => {
    render(
      <StatsBanner
        stats={{
          productCount: 5,
          brandCount: 2,
          countiesServed: 1,
          reviews: { count: 30, average: 4.6 },
        }}
      />,
    );
    expect(screen.getByText('4.6★')).toBeInTheDocument();
  });
});
