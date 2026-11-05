import { describe, expect, it } from 'vitest';
import {
  ceilToWholeShilling,
  discountPercent,
  formatKes,
  inclusiveTaxOf,
  percentOf,
  shillingsToMinor,
} from './money.js';

describe('money', () => {
  it('converts shillings to minor units', () => {
    expect(shillingsToMinor(129_999)).toBe(12_999_900);
    expect(() => shillingsToMinor(10.5)).toThrow(RangeError);
  });

  it('rounds up to whole shillings', () => {
    expect(ceilToWholeShilling(10_001)).toBe(10_100);
    expect(ceilToWholeShilling(10_000)).toBe(10_000);
  });

  it('computes percentages with half-up integer rounding', () => {
    expect(percentOf(10_000, 1_500)).toBe(1_500);
    expect(percentOf(333, 5_000)).toBe(167); // 166.5 -> 167
    expect(() => percentOf(100, 10_001)).toThrow(RangeError);
  });

  it('extracts inclusive VAT at 16%', () => {
    // 11,600.00 KES inclusive -> 1,600.00 VAT
    expect(inclusiveTaxOf(1_160_000, 1_600)).toBe(160_000);
    // 100.00 KES inclusive -> 13.79 VAT
    expect(inclusiveTaxOf(10_000, 1_600)).toBe(1_379);
  });

  it('computes display discount percentage', () => {
    expect(discountPercent(150_000, 120_000)).toBe(20);
    expect(discountPercent(0, 100)).toBe(0);
    expect(discountPercent(100, 120)).toBe(0);
  });

  it('formats KES', () => {
    expect(formatKes(12_999_900)).toMatch(/129,999/);
    expect(() => formatKes(1.5)).toThrow(RangeError);
  });
});
