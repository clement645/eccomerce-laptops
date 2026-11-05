import { describe, expect, it } from 'vitest';
import { formatKes, humanize, slugify, toMinor, toShillings } from '../format';

describe('money helpers', () => {
  it('converts shillings typed by staff to minor units and back', () => {
    expect(toMinor('85,000')).toBe(8_500_000);
    expect(toMinor('1499.50')).toBe(149_950);
    expect(toMinor('')).toBeNull();
    expect(toMinor('-5')).toBeNull();
    expect(toMinor('abc')).toBeNull();
    expect(toShillings(8_500_000)).toBe('85000');
    expect(toShillings(null)).toBe('');
  });

  it('formats KES without inventing cents', () => {
    expect(formatKes(8_500_000)).toMatch(/85,000/);
    expect(formatKes(null)).toBe('—');
  });
});

describe('text helpers', () => {
  it('builds URL slugs and readable statuses', () => {
    expect(slugify('HP EliteBook 840 G10 — Core i7!')).toBe('hp-elitebook-840-g10-core-i7');
    expect(humanize('PARTIALLY_REFUNDED')).toBe('Partially refunded');
  });
});
