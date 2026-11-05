import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Pagination, pageWindow } from './pagination';

describe('pageWindow', () => {
  it('lists every page when there are few', () => {
    expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('collapses distant pages into gaps', () => {
    expect(pageWindow(6, 20)).toEqual([1, 'gap', 5, 6, 7, 'gap', 20]);
    expect(pageWindow(1, 20)).toEqual([1, 2, 'gap', 20]);
  });
});

describe('Pagination', () => {
  it('marks the current page and links neighbours', () => {
    render(<Pagination page={2} totalPages={3} hrefFor={(p) => `/shop?page=${p}`} />);
    expect(screen.getByRole('link', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute(
      'href',
      '/shop?page=1',
    );
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute('href', '/shop?page=3');
  });

  it('renders nothing for a single page', () => {
    const { container } = render(<Pagination page={1} totalPages={1} hrefFor={() => '/'} />);
    expect(container).toBeEmptyDOMElement();
  });
});
