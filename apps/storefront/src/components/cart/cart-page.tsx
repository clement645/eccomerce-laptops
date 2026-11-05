'use client';

import Link from 'next/link';
import { Loader2, ShieldCheck, ShoppingBag, Truck } from 'lucide-react';
import { FormAlert } from '@/components/forms/fields';
import { formatKes } from '@/lib/format';
import { useCart, useCartUi } from '@/lib/cart/cart-context';
import { routes } from '@/lib/routes';
import { CartLines } from './cart-lines';

export function CartPage() {
  const { data: cart, isPending } = useCart();
  const { notice } = useCartUi();

  return (
    <main id="main" className="flex-1 bg-surface-muted">
      <div className="container-page py-10">
        <h1 className="text-3xl font-extrabold">Your cart</h1>
        {isPending ? (
          <p role="status" className="mt-10 flex items-center gap-2 text-ink-muted">
            <Loader2 aria-hidden className="size-5 animate-spin" /> Loading your cart…
          </p>
        ) : !cart || cart.lines.length === 0 ? (
          <div className="mt-8 flex flex-col items-center rounded-3xl border border-line bg-white px-6 py-16 text-center">
            <ShoppingBag aria-hidden className="size-12 text-primary-300" />
            <h2 className="mt-4 text-xl font-bold">Your cart is empty</h2>
            <p className="mt-2 text-ink-muted">Browse our laptops, gaming gear and accessories.</p>
            <Link
              href={routes.shop}
              className="mt-6 rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-button"
            >
              Start shopping
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
            <section
              aria-label="Items"
              className="rounded-2xl border border-line bg-white px-5 shadow-card"
            >
              {notice && (
                <div className="pt-4">
                  <FormAlert tone="error">{notice}</FormAlert>
                </div>
              )}
              <CartLines lines={cart.lines} />
            </section>
            <aside className="h-fit space-y-4 rounded-2xl border border-line bg-white p-5 shadow-card lg:sticky lg:top-32">
              <h2 className="text-lg font-bold">Order summary</h2>
              <p className="flex justify-between text-sm">
                <span className="text-ink-muted">
                  Subtotal ({cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'})
                </span>
                <span className="font-bold">{formatKes(cart.subtotalMinor)}</span>
              </p>
              <p className="flex justify-between text-sm">
                <span className="text-ink-muted">Delivery</span>
                <span>Calculated at checkout</span>
              </p>
              {!cart.checkoutReady && (
                <FormAlert tone="error">
                  Some items need your attention before you can check out.
                </FormAlert>
              )}
              <Link
                href="/checkout"
                aria-disabled={!cart.checkoutReady}
                className={`flex justify-center rounded-full px-6 py-3 text-sm font-semibold text-white shadow-button ${cart.checkoutReady ? 'bg-primary-600 hover:bg-primary-700' : 'pointer-events-none bg-primary-600/50'}`}
              >
                Proceed to checkout
              </Link>
              <ul className="space-y-2 border-t border-line pt-4 text-xs text-ink-muted">
                <li className="flex items-center gap-2">
                  <ShieldCheck aria-hidden className="size-4 text-primary-600" /> Secure M-Pesa
                  checkout. Prices include VAT.
                </li>
                <li className="flex items-center gap-2">
                  <Truck aria-hidden className="size-4 text-primary-600" /> Delivery to all 47
                  counties.
                </li>
              </ul>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
