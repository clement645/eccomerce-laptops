import { priceOrder, shippingFor } from './pricing.js';

const VAT = 1600;

describe('priceOrder', () => {
  it('totals lines and adds delivery, extracting inclusive VAT', () => {
    const { lines, totals } = priceOrder(
      [
        { unitPriceMinor: 10_999_900, quantity: 1 },
        { unitPriceMinor: 1_499_900, quantity: 2 },
      ],
      { priceMinor: 30_000, freeAboveMinor: null },
      VAT,
    );
    expect(totals).toEqual({
      subtotalMinor: 13_999_700,
      discountMinor: 0,
      shippingMinor: 30_000,
      taxMinor: lines[0]!.taxMinor + lines[1]!.taxMinor + 4_138,
      roundingMinor: 0,
      totalMinor: 14_029_700,
    });
    // 116.00 KES inclusive contains 16.00 VAT.
    expect(priceOrder([{ unitPriceMinor: 11_600, quantity: 1 }], null, VAT).totals.taxMinor).toBe(
      1_600,
    );
  });

  it('makes delivery free at the threshold', () => {
    const { totals } = priceOrder(
      [{ unitPriceMinor: 10_000_000, quantity: 1 }],
      { priceMinor: 30_000, freeAboveMinor: 10_000_000 },
      VAT,
    );
    expect(totals.shippingMinor).toBe(0);
    expect(shippingFor({ priceMinor: 30_000, freeAboveMinor: 10_000_000 }, 9_999_999)).toBe(30_000);
  });

  it('rounds the total up to a whole shilling for M-Pesa and records the rounding', () => {
    const { totals } = priceOrder([{ unitPriceMinor: 10_050, quantity: 1 }], null, VAT);
    expect(totals).toMatchObject({ subtotalMinor: 10_050, roundingMinor: 50, totalMinor: 10_100 });
  });

  it('satisfies the database invariants for every line and order', () => {
    const { lines, totals } = priceOrder(
      [
        { unitPriceMinor: 333, quantity: 3, discountMinor: 100 },
        { unitPriceMinor: 99_999, quantity: 1 },
      ],
      { priceMinor: 45_000, freeAboveMinor: null },
      VAT,
    );
    for (const line of lines) expect(line.taxMinor).toBeLessThanOrEqual(line.lineTotalMinor);
    expect(totals.totalMinor).toBe(
      totals.subtotalMinor - totals.discountMinor + totals.shippingMinor + totals.roundingMinor,
    );
    expect(totals.taxMinor).toBeLessThanOrEqual(totals.totalMinor);
    expect(totals.roundingMinor).toBeGreaterThanOrEqual(0);
    expect(totals.roundingMinor).toBeLessThan(100);
  });

  it('never lets a discount exceed the line', () => {
    const { lines } = priceOrder(
      [{ unitPriceMinor: 1_000, quantity: 1, discountMinor: 5_000 }],
      null,
      VAT,
    );
    expect(lines[0]).toMatchObject({ lineTotalMinor: 0, discountMinor: 1_000 });
  });

  it('rejects non-integer money and bad quantities', () => {
    expect(() => priceOrder([{ unitPriceMinor: 10.5, quantity: 1 }], null, VAT)).toThrow(
      RangeError,
    );
    expect(() => priceOrder([{ unitPriceMinor: 100, quantity: 0 }], null, VAT)).toThrow(RangeError);
  });
});
