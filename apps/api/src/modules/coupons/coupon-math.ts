/** Discount for a coupon on a goods subtotal (minor units), in whole shillings, never above the subtotal. */
export function couponDiscount(
  coupon: {
    type: 'PERCENTAGE' | 'FIXED_AMOUNT';
    percentBps: number | null;
    amountMinor: number | null;
    maxDiscountMinor: number | null;
  },
  subtotalMinor: number,
): number {
  let discount =
    coupon.type === 'PERCENTAGE'
      ? Math.floor((subtotalMinor * (coupon.percentBps ?? 0)) / 10_000)
      : (coupon.amountMinor ?? 0);
  if (coupon.maxDiscountMinor !== null) discount = Math.min(discount, coupon.maxDiscountMinor);
  discount = Math.min(discount, subtotalMinor);
  // Whole shillings keep receipts and M-Pesa amounts tidy.
  return Math.max(0, Math.floor(discount / 100) * 100);
}

/**
 * Splits an order-level discount across lines in proportion to their value, so each line's VAT
 * is computed on what was actually charged. Largest-remainder rounding: the parts always add up
 * exactly, and no line is discounted below zero.
 */
export function allocateDiscount(lineTotals: number[], discountMinor: number): number[] {
  const total = lineTotals.reduce((a, b) => a + b, 0);
  if (discountMinor <= 0 || total <= 0) return lineTotals.map(() => 0);
  const capped = Math.min(discountMinor, total);
  const exact = lineTotals.map((t) => (t * capped) / total);
  const parts = exact.map(Math.floor);
  let remainder = capped - parts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (remainder === 0) break;
    if (parts[index]! < lineTotals[index]!) {
      parts[index]! += 1;
      remainder -= 1;
    }
  }
  return parts;
}
