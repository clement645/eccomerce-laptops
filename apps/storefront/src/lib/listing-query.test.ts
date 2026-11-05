import { describe, expect, it } from 'vitest';
import { hasRefinements, listingHref, parseListingQuery } from './listing-query';

describe('parseListingQuery', () => {
  it('pins the page scope and drops invalid parameters instead of failing', () => {
    const query = parseListingQuery(
      { brand: 'dell', sort: 'cheapest', page: '2' },
      { category: 'laptops' },
    );
    expect(query).toMatchObject({ category: 'laptops', brand: ['dell'], sort: 'newest', page: 2 });
  });

  it('lets the fixed scope override user input', () => {
    expect(parseListingQuery({ category: 'printers' }, { category: 'laptops' }).category).toBe(
      'laptops',
    );
    expect(parseListingQuery({}, { onSale: true }).onSale).toBe(true);
  });
});

describe('listingHref', () => {
  const base = parseListingQuery({ brand: ['dell', 'hp'], sort: 'price_asc', page: '3' });

  it('never writes the fixed scope or default values into the URL', () => {
    const query = parseListingQuery({}, { category: 'laptops' });
    expect(listingHref('/category/laptops', query, { category: 'laptops' })).toBe(
      '/category/laptops',
    );
  });

  it('keeps other filters and resets to page 1 when a filter changes', () => {
    expect(listingHref('/shop', base, {}, { brand: ['dell'] })).toBe(
      '/shop?brand=dell&sort=price_asc',
    );
  });

  it('sets the page explicitly for pagination links and keeps a custom page size', () => {
    const custom = parseListingQuery({ pageSize: '6' });
    expect(listingHref('/shop', base, {}, { page: 4 })).toBe(
      '/shop?brand=dell&brand=hp&sort=price_asc&page=4',
    );
    expect(listingHref('/shop', custom, {}, { page: 2 })).toBe('/shop?pageSize=6&page=2');
    expect(listingHref('/shop', base, {}, { page: 1 })).toBe(
      '/shop?brand=dell&brand=hp&sort=price_asc',
    );
  });

  it('encodes spec filters safely', () => {
    const query = parseListingQuery({ spec: 'Resolution:2560 x 1440 (QHD)' });
    expect(listingHref('/shop', query, {})).toBe('/shop?spec=Resolution%3A2560+x+1440+%28QHD%29');
  });
});

describe('hasRefinements', () => {
  it('ignores the pinned scope', () => {
    expect(hasRefinements(parseListingQuery({}, { brand: 'hp' }), { brand: 'hp' })).toBe(false);
    expect(
      hasRefinements(parseListingQuery({ inStock: 'true' }, { brand: 'hp' }), { brand: 'hp' }),
    ).toBe(true);
  });
});
