import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchAutocomplete } from './search-autocomplete';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

function renderSearch() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SearchAutocomplete id="test-search" />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

describe('SearchAutocomplete', () => {
  it('shows suggestions and navigates with the keyboard', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          products: [
            {
              slug: 'lenovo-thinkpad-e14',
              name: 'Lenovo ThinkPad E14',
              brand: 'Lenovo',
              category: 'Laptops',
              categorySlug: 'laptops',
              priceMinor: 10_499_900,
              imageUrl: null,
            },
          ],
          categories: [],
          brands: [{ slug: 'lenovo', name: 'Lenovo' }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderSearch();

    const input = screen.getByRole('combobox', { name: 'Search products' });
    await user.type(input, 'thinkpd');
    expect(await screen.findByRole('option', { name: /Lenovo ThinkPad E14/ })).toBeInTheDocument();
    expect(screen.getByText('Brands')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('/catalog/search/suggest?q=thinkpd');

    await user.keyboard('{ArrowDown}');
    expect(input.getAttribute('aria-activedescendant')).toBeTruthy();
    await user.keyboard('{Enter}');
    expect(push).toHaveBeenCalledWith('/products/lenovo-thinkpad-e14');
  });

  it('does not query for a single character', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderSearch();
    await user.type(screen.getByRole('combobox'), 'a');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is a plain GET form to /search', () => {
    renderSearch();
    const form = screen.getByRole('search');
    expect(form).toHaveAttribute('action', '/search');
    expect(form).toHaveAttribute('method', 'get');
  });
});
