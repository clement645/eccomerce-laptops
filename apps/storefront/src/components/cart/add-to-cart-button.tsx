'use client';

import { Loader2, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useCartActions } from '@/lib/cart/cart-context';

/** Quick add from a product card (default variant, quantity 1). */
export function AddToCartButton({
  variantId,
  productName,
  outOfStock,
}: {
  variantId: string;
  productName: string;
  outOfStock: boolean;
}) {
  const { add } = useCartActions();
  const pending = add.isPending && add.variables?.variantId === variantId;
  return (
    <button
      type="button"
      disabled={outOfStock || pending}
      onClick={() => add.mutate({ variantId, quantity: 1 })}
      // The name starts with the visible text, so voice control ("click Add to Cart") finds it.
      aria-label={outOfStock ? `Out of stock: ${productName}` : `Add to Cart: ${productName}`}
      className={cn(
        'inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 py-2 text-xs font-semibold transition disabled:cursor-not-allowed sm:px-3',
        outOfStock
          ? 'bg-surface-sunken text-ink-subtle'
          : 'bg-primary-600 text-white shadow-button hover:bg-primary-700 disabled:opacity-75',
      )}
    >
      {pending ? (
        <Loader2 aria-hidden className="size-3.5 animate-spin" />
      ) : (
        <ShoppingCart aria-hidden className="size-3.5" />
      )}
      {outOfStock ? 'Out of stock' : 'Add to Cart'}
    </button>
  );
}
