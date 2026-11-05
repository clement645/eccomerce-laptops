import { allocateDiscount, couponDiscount } from './coupon-math.js';

const pct = (bps: number, cap: number | null = null) => ({
  type: 'PERCENTAGE' as const,
  percentBps: bps,
  amountMinor: null,
  maxDiscountMinor: cap,
});
const fixed = (amount: number) => ({
  type: 'FIXED_AMOUNT' as const,
  percentBps: null,
  amountMinor: amount,
  maxDiscountMinor: null,
});

describe('couponDiscount', () => {
  it('takes a percentage in whole shillings, capped', () => {
    expect(couponDiscount(pct(1000), 8_499_950)).toBe(849_900); // 10% of 84,999.50 → 8,499
    expect(couponDiscount(pct(1500, 500_000), 10_000_000)).toBe(500_000);
  });

  it('never discounts more than the goods', () => {
    expect(couponDiscount(fixed(1_000_000), 600_000)).toBe(600_000);
    expect(couponDiscount(fixed(250_000), 600_000)).toBe(200_000 + 50_000);
  });
});

describe('allocateDiscount', () => {
  it('splits in proportion and adds up exactly', () => {
    const parts = allocateDiscount([10_000_000, 2_000_000, 1], 1_000_000);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1_000_000);
    expect(parts[0]).toBeGreaterThan(parts[1]!);
    expect(parts[2]).toBeLessThanOrEqual(1);
  });

  it('handles odd remainders and over-large discounts', () => {
    expect(allocateDiscount([100, 100, 100], 100)).toEqual([34, 33, 33]);
    expect(allocateDiscount([500, 300], 10_000)).toEqual([500, 300]);
    expect(allocateDiscount([500, 300], 0)).toEqual([0, 0]);
  });
});
