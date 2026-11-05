'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { ShoppingCart } from 'lucide-react';
import { useCart } from '@/lib/cart/cart-context';
import { routes } from '@/lib/routes';

const noop = () => () => {};

/** Header cart icon with item count (rendered after hydration; the cart lives in the browser session). */
export function CartLink() {
  const { data } = useCart();
  const hydrated = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const count = hydrated ? (data?.itemCount ?? 0) : 0;
  return (
    <Link
      href={routes.cart}
      className="relative grid size-10 place-items-center rounded-full text-ink transition hover:bg-primary-50 hover:text-primary-600"
    >
      <ShoppingCart aria-hidden className="size-5" />
      <span className="sr-only">
        Cart{count > 0 ? `, ${count} ${count === 1 ? 'item' : 'items'}` : ''}
      </span>
      {count > 0 && (
        <span
          aria-hidden
          className="absolute right-0 top-0 grid min-w-5 place-items-center rounded-full bg-primary-600 px-1 text-[10px] font-bold text-white"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
