'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { ShoppingBag, X } from 'lucide-react';
import { FormAlert } from '@/components/forms/fields';
import { formatKes } from '@/lib/format';
import { useCart, useCartUi } from '@/lib/cart/cart-context';
import { CartLines } from './cart-lines';

/** Slide-in cart shown after adding an item. Built on <dialog> for focus handling and Escape. */
export function CartDrawer() {
  const { drawerOpen, closeDrawer, notice, setNotice } = useCartUi();
  const { data: cart } = useCart();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (drawerOpen && !dialog.open) dialog.showModal();
    if (!drawerOpen && dialog.open) dialog.close();
  }, [drawerOpen]);

  useEffect(() => {
    closeDrawer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <dialog
      ref={dialogRef}
      aria-label="Your cart"
      onClose={() => {
        closeDrawer();
        setNotice(null);
      }}
      onClick={(event) => event.target === dialogRef.current && closeDrawer()}
      className="m-0 ml-auto h-dvh max-h-dvh w-[min(26rem,92vw)] max-w-none bg-white p-0 shadow-2xl backdrop:bg-navy-950/50"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-bold">
            Your cart{cart && cart.itemCount > 0 ? ` (${cart.itemCount})` : ''}
          </h2>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close cart"
            className="grid size-10 place-items-center rounded-full hover:bg-primary-50"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5">
          {notice && (
            <div className="pt-4">
              <FormAlert tone="error">{notice}</FormAlert>
            </div>
          )}
          {cart && cart.lines.length > 0 ? (
            <CartLines lines={cart.lines} compact />
          ) : (
            <div className="flex flex-col items-center py-16 text-center">
              <ShoppingBag aria-hidden className="size-10 text-primary-300" />
              <p className="mt-3 font-semibold">Your cart is empty</p>
            </div>
          )}
        </div>
        {cart && cart.lines.length > 0 && (
          <div className="space-y-3 border-t border-line px-5 py-4">
            <p className="flex justify-between text-sm">
              <span className="text-ink-muted">Subtotal</span>
              <span className="font-bold">{formatKes(cart.subtotalMinor)}</span>
            </p>
            <p className="text-xs text-ink-subtle">
              Delivery is calculated at checkout. Prices include VAT.
            </p>
            <Link
              href="/checkout"
              className="flex justify-center rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-button hover:bg-primary-700"
            >
              Checkout
            </Link>
            <Link
              href="/cart"
              className="flex justify-center rounded-full border border-line px-6 py-3 text-sm font-semibold text-ink hover:border-primary-200"
            >
              View cart
            </Link>
          </div>
        )}
      </div>
    </dialog>
  );
}
