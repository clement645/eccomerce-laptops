import { describe, expect, it } from 'vitest';
import { productListQuerySchema } from './catalog.js';

describe('productListQuerySchema', () => {
  it('applies defaults', () => {
    expect(productListQuerySchema.parse({})).toMatchObject({
      brand: [],
      specs: {},
      sort: 'newest',
      page: 1,
      pageSize: 24,
      inStock: false,
    });
  });

  it('defaults to relevance when searching, and refuses relevance without a term', () => {
    expect(productListQuerySchema.parse({ q: ' rtx ' })).toMatchObject({
      q: 'rtx',
      sort: 'relevance',
    });
    expect(productListQuerySchema.parse({ sort: 'relevance' }).sort).toBe('newest');
  });

  it('accepts single or repeated list parameters', () => {
    expect(productListQuerySchema.parse({ brand: 'hp' }).brand).toEqual(['hp']);
    expect(productListQuerySchema.parse({ brand: ['hp', 'dell'] }).brand).toEqual(['hp', 'dell']);
  });

  it('groups spec filters by key, splitting on the first colon only', () => {
    const query = productListQuerySchema.parse({
      spec: ['RAM:16GB', 'RAM:8GB', 'Resolution:2560 x 1440 (QHD)', 'Ratio:16:10'],
    });
    expect(query.specs).toEqual({
      RAM: ['16GB', '8GB'],
      Resolution: ['2560 x 1440 (QHD)'],
      Ratio: ['16:10'],
    });
  });

  it('parses flags and prices', () => {
    const query = productListQuerySchema.parse({
      inStock: 'true',
      onSale: '1',
      minPrice: '50000',
      maxPrice: '',
    });
    expect(query).toMatchObject({
      inStock: true,
      onSale: true,
      minPrice: 50_000,
      maxPrice: undefined,
    });
  });

  it('rejects invalid input', () => {
    expect(productListQuerySchema.safeParse({ sort: 'cheapest' }).success).toBe(false);
    expect(productListQuerySchema.safeParse({ brand: 'Not A Slug' }).success).toBe(false);
    expect(productListQuerySchema.safeParse({ spec: 'no-colon' }).success).toBe(false);
    expect(productListQuerySchema.safeParse({ minPrice: '100', maxPrice: '50' }).success).toBe(
      false,
    );
    expect(productListQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });
});
