'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCartActions, useCartUi } from '@/lib/cart/cart-context';
import { Heart, Minus, Plus, ShoppingCart, Zap } from 'lucide-react';
import type { ProductVariantDetail } from '@repo/shared-types';
import { cn } from '@/lib/cn';
import { formatKes } from '@/lib/format';

function StockLine({ variant }: { variant: ProductVariantDetail }) {
  if (variant.stockStatus === 'OUT_OF_STOCK') {
    return (
      <p className="flex items-center gap-2 text-sm font-semibold text-danger">
        <span aria-hidden className="size-2 rounded-full bg-danger" /> Out of stock
      </p>
    );
  }
  if (variant.stockStatus === 'LOW_STOCK') {
    return (
      <p className="flex items-center gap-2 text-sm font-semibold text-warning">
        <span aria-hidden className="size-2 rounded-full bg-warning" /> Only {variant.maxQuantity}{' '}
        left in stock
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm font-semibold text-success">
      <span aria-hidden className="size-2 rounded-full bg-success" /> In stock
    </p>
  );
}

/**
 * Variant choice, quantity and buy buttons. The selected variant is mirrored in the URL (?variant=SKU)
 * so it can be shared.
 */
export function PurchasePanel({
  variants,
  initialSku,
}: {
  variants: ProductVariantDetail[];
  initialSku?: string;
}) {
  const router = useRouter();
  const { add } = useCartActions();
  const { closeDrawer } = useCartUi();
  const [sku, setSku] = useState(
    () => variants.find((v) => v.sku === initialSku)?.sku ?? variants[0]?.sku,
  );
  const variant = variants.find((v) => v.sku === sku) ?? variants[0];
  const [quantity, setQuantity] = useState(1);
  if (!variant) return null;

  const max = variant.maxQuantity;
  const canBuy = max > 0;
  const clamp = (value: number) => Math.min(Math.max(1, value), Math.max(1, max));

  const select = (next: ProductVariantDetail) => {
    setSku(next.sku);
    setQuantity((q) => Math.min(Math.max(1, q), Math.max(1, next.maxQuantity)));
    const url = new URL(window.location.href);
    if (next.isDefault) url.searchParams.delete('variant');
    else url.searchParams.set('variant', next.sku);
    window.history.replaceState(null, '', url);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-baseline gap-3">
          <p
            className="font-display text-3xl font-extrabold text-primary-600 md:text-4xl"
            aria-live="polite"
          >
            {formatKes(variant.priceMinor)}
          </p>
          {variant.compareAtPriceMinor && (
            <>
              <p className="text-lg text-ink-subtle line-through">
                <span className="sr-only">Was </span>
                {formatKes(variant.compareAtPriceMinor)}
              </p>
              <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700">
                Save {formatKes(variant.compareAtPriceMinor - variant.priceMinor)} (
                {variant.discountPercent}%)
              </span>
            </>
          )}
        </div>
        <p className="mt-1 text-xs text-ink-subtle">Price includes VAT.</p>
      </div>

      <StockLine variant={variant} />

      {variants.length > 1 && (
        <fieldset>
          <legend className="mb-2 text-sm font-bold text-ink">Configuration</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {variants.map((option) => {
              const selected = option.sku === variant.sku;
              return (
                <label
                  key={option.sku}
                  className={cn(
                    'flex cursor-pointer flex-col rounded-2xl border-2 px-4 py-3 transition',
                    selected
                      ? 'border-primary-600 bg-primary-50'
                      : 'border-line hover:border-primary-200',
                  )}
                >
                  <input
                    type="radio"
                    name="variant"
                    value={option.sku}
                    checked={selected}
                    onChange={() => select(option)}
                    className="sr-only"
                  />
                  <span className="text-sm font-semibold text-ink">{option.name}</span>
                  <span className="mt-0.5 text-sm text-ink-muted">
                    {formatKes(option.priceMinor)}
                    {option.stockStatus === 'OUT_OF_STOCK' && (
                      <span className="ml-2 text-danger">· Out of stock</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex items-center rounded-full border border-line"
          role="group"
          aria-label="Quantity"
        >
          <button
            type="button"
            onClick={() => setQuantity((q) => clamp(q - 1))}
            disabled={!canBuy || quantity <= 1}
            className="grid size-11 place-items-center rounded-full text-ink transition hover:text-primary-600 disabled:text-ink-subtle"
            aria-label="Decrease quantity"
          >
            <Minus aria-hidden className="size-4" />
          </button>
          <label htmlFor="quantity" className="sr-only">
            Quantity
          </label>
          <input
            id="quantity"
            type="number"
            inputMode="numeric"
            min={1}
            max={Math.max(1, max)}
            value={quantity}
            disabled={!canBuy}
            onChange={(event) => setQuantity(clamp(Number(event.target.value) || 1))}
            className="w-12 bg-transparent text-center text-sm font-semibold [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            type="button"
            onClick={() => setQuantity((q) => clamp(q + 1))}
            disabled={!canBuy || quantity >= max}
            className="grid size-11 place-items-center rounded-full text-ink transition hover:text-primary-600 disabled:text-ink-subtle"
            aria-label="Increase quantity"
          >
            <Plus aria-hidden className="size-4" />
          </button>
        </div>
        <button
          type="button"
          disabled={!canBuy || add.isPending}
          onClick={() => add.mutate({ variantId: variant.id, quantity })}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary-600 px-6 py-3.5 text-sm font-semibold text-white shadow-button transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70 sm:flex-none"
        >
          <ShoppingCart aria-hidden className="size-4" />
          {canBuy ? 'Add to Cart' : 'Out of stock'}
        </button>
        <button
          type="button"
          disabled={!canBuy || add.isPending}
          onClick={() =>
            add.mutate(
              { variantId: variant.id, quantity },
              {
                onSuccess: () => {
                  closeDrawer();
                  router.push('/checkout');
                },
              },
            )
          }
          className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-primary-600 px-6 py-3 text-sm font-semibold text-primary-600 transition hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Zap aria-hidden className="size-4" />
          Buy Now
        </button>
        <button
          type="button"
          disabled
          title="Wishlist opens soon"
          aria-label="Add to wishlist"
          className="grid size-12 place-items-center rounded-full border border-line text-ink-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Heart aria-hidden className="size-5" />
        </button>
      </div>
      <p className="text-xs text-ink-subtle">SKU: {variant.sku}</p>
    </div>
  );
}
