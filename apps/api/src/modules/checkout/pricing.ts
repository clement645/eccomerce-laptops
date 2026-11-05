import {
  assertMinorUnits,
  ceilToWholeShilling,
  inclusiveTaxOf,
  type CheckoutTotals,
  type MinorUnits,
} from '@repo/shared-types';

export interface PricedLine {
  unitPriceMinor: MinorUnits;
  quantity: number;
  /** Line-level discount (coupons arrive in Phase 9). */
  discountMinor?: MinorUnits;
}

export interface PricedLineResult {
  lineTotalMinor: MinorUnits;
  discountMinor: MinorUnits;
  taxMinor: MinorUnits;
}

export interface ShippingCharge {
  priceMinor: MinorUnits;
  freeAboveMinor: MinorUnits | null;
}

/** Delivery price after any free-delivery threshold (measured on the subtotal after discounts). */
export function shippingFor(charge: ShippingCharge, goodsMinor: MinorUnits): MinorUnits {
  return charge.freeAboveMinor !== null && goodsMinor >= charge.freeAboveMinor
    ? 0
    : charge.priceMinor;
}

/**
 * Server-side order pricing. Prices are VAT-inclusive (Kenya VAT is applied to goods and delivery),
 * so tax is extracted, not added. The total is rounded up to a whole shilling because M-Pesa only
 * accepts whole shillings; the rounding is recorded explicitly.
 * Integer arithmetic only.
 */
export function priceOrder(
  lines: PricedLine[],
  shipping: ShippingCharge | null,
  vatRateBps: number,
): { lines: PricedLineResult[]; totals: CheckoutTotals } {
  const pricedLines = lines.map((line) => {
    assertMinorUnits(line.unitPriceMinor);
    if (!Number.isInteger(line.quantity) || line.quantity < 1)
      throw new RangeError('Quantity must be a positive integer');
    const gross = line.unitPriceMinor * line.quantity;
    const discountMinor = Math.min(line.discountMinor ?? 0, gross);
    const lineTotalMinor = gross - discountMinor;
    return { lineTotalMinor, discountMinor, taxMinor: inclusiveTaxOf(lineTotalMinor, vatRateBps) };
  });

  const subtotalMinor = lines.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0);
  const discountMinor = pricedLines.reduce((sum, line) => sum + line.discountMinor, 0);
  const goodsMinor = subtotalMinor - discountMinor;
  const shippingMinor = shipping ? shippingFor(shipping, goodsMinor) : 0;
  const taxMinor =
    pricedLines.reduce((sum, line) => sum + line.taxMinor, 0) +
    inclusiveTaxOf(shippingMinor, vatRateBps);
  const beforeRounding = goodsMinor + shippingMinor;
  const totalMinor = ceilToWholeShilling(beforeRounding);

  return {
    lines: pricedLines,
    totals: {
      subtotalMinor,
      discountMinor,
      shippingMinor,
      taxMinor,
      roundingMinor: totalMinor - beforeRounding,
      totalMinor,
    },
  };
}
