/**
 * Money is always represented as an integer number of minor units (KES cents).
 * Never use floating-point arithmetic for amounts.
 */
export type MinorUnits = number;

export const DEFAULT_CURRENCY = 'KES' as const;
export type CurrencyCode = typeof DEFAULT_CURRENCY;

const MINOR_PER_MAJOR = 100;

export function assertMinorUnits(value: number): asserts value is MinorUnits {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Money must be an integer number of minor units, got ${value}`);
  }
}

/** Convert a whole-shilling amount to minor units. */
export function shillingsToMinor(shillings: number): MinorUnits {
  if (!Number.isSafeInteger(shillings)) {
    throw new RangeError(`Expected whole shillings, got ${shillings}`);
  }
  return shillings * MINOR_PER_MAJOR;
}

/** Round minor units up to the next whole shilling (M-Pesa only accepts whole shillings). */
export function ceilToWholeShilling(amount: MinorUnits): MinorUnits {
  assertMinorUnits(amount);
  return Math.ceil(amount / MINOR_PER_MAJOR) * MINOR_PER_MAJOR;
}

/** Percentage discount in basis points (1500 = 15%), rounded half-up to the nearest minor unit. */
export function percentOf(amount: MinorUnits, basisPoints: number): MinorUnits {
  assertMinorUnits(amount);
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new RangeError(`Basis points must be an integer between 0 and 10000, got ${basisPoints}`);
  }
  // Integer maths: (amount * bps + 5000) / 10000, floored, gives half-up rounding for non-negative amounts.
  return Math.floor((amount * basisPoints + 5_000) / 10_000);
}

/**
 * VAT contained in a VAT-inclusive amount: amount * rate / (1 + rate).
 * Rate is in basis points (1600 = 16%).
 */
export function inclusiveTaxOf(amount: MinorUnits, rateBasisPoints: number): MinorUnits {
  assertMinorUnits(amount);
  const denominator = 10_000 + rateBasisPoints;
  return Math.floor((amount * rateBasisPoints * 2 + denominator) / (denominator * 2));
}

/** Whole-number discount percentage between a previous and current price, for display only. */
export function discountPercent(previous: MinorUnits, current: MinorUnits): number {
  if (previous <= 0 || current >= previous) return 0;
  return Math.round(((previous - current) / previous) * 100);
}

const kesFormatter = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: DEFAULT_CURRENCY,
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Format minor units for display, e.g. 12999900 -> "Ksh 129,999". */
export function formatKes(amount: MinorUnits): string {
  assertMinorUnits(amount);
  return kesFormatter.format(amount / MINOR_PER_MAJOR);
}
