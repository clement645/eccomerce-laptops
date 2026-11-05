'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Minus, Plus, Trash2 } from 'lucide-react';
import type { CartLine } from '@repo/shared-types';
import { DeviceArt } from '@/components/illustrations/device-art';
import { cn } from '@/lib/cn';
import { formatKes, hashString } from '@/lib/format';
import { useCartActions } from '@/lib/cart/cart-context';
import { routes } from '@/lib/routes';

const ISSUE_TEXT: Record<NonNullable<CartLine['issue']>, string> = {
  OUT_OF_STOCK: 'Out of stock. Remove it to continue.',
  QUANTITY_REDUCED: 'Fewer units are available now. Lower the quantity to continue.',
  UNAVAILABLE: 'No longer available. Remove it to continue.',
};

export function CartLines({ lines, compact = false }: { lines: CartLine[]; compact?: boolean }) {
  const { update, remove } = useCartActions();
  const busy = update.isPending || remove.isPending;

  return (
    <ul className="divide-y divide-line">
      {lines.map((line) => (
        <li key={line.variantId} className="flex gap-3 py-4">
          {/* Same destination as the product name link: hidden from assistive tech and the tab order. */}
          <Link
            href={routes.product(line.productSlug)}
            aria-hidden
            tabIndex={-1}
            className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-surface-sunken"
          >
            {line.imageUrl ? (
              <Image src={line.imageUrl} alt="" fill sizes="80px" className="object-contain p-1" />
            ) : (
              <DeviceArt
                kind={line.categorySlug}
                idPrefix={`cart-${compact ? 'c' : 'p'}-${line.variantId}`}
                accent={hashString(line.productSlug)}
                className="h-full w-full p-1"
              />
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              href={routes.product(line.productSlug)}
              className="line-clamp-2 text-sm font-semibold text-ink hover:text-primary-600"
            >
              {line.productName}
            </Link>
            <p className="text-xs text-ink-muted">{line.variantName}</p>
            {line.issue && (
              <p className="mt-1 text-xs font-semibold text-danger">{ISSUE_TEXT[line.issue]}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div
                className="flex items-center rounded-full border border-line"
                role="group"
                aria-label={`Quantity of ${line.productName}`}
              >
                <button
                  type="button"
                  disabled={busy || line.quantity <= 1}
                  onClick={() =>
                    update.mutate({ variantId: line.variantId, quantity: line.quantity - 1 })
                  }
                  className="grid size-8 place-items-center rounded-full disabled:text-ink-subtle"
                  aria-label="Decrease quantity"
                >
                  <Minus aria-hidden className="size-3.5" />
                </button>
                <span className="w-7 text-center text-sm font-semibold" aria-live="polite">
                  {line.quantity}
                </span>
                <button
                  type="button"
                  disabled={busy || line.quantity >= line.maxQuantity}
                  onClick={() =>
                    update.mutate({ variantId: line.variantId, quantity: line.quantity + 1 })
                  }
                  className="grid size-8 place-items-center rounded-full disabled:text-ink-subtle"
                  aria-label="Increase quantity"
                >
                  <Plus aria-hidden className="size-3.5" />
                </button>
              </div>
              <p
                className={cn(
                  'text-sm font-bold',
                  line.issue === 'UNAVAILABLE' ? 'text-ink-subtle line-through' : 'text-ink',
                )}
              >
                {formatKes(line.lineTotalMinor)}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => remove.mutate(line.variantId)}
              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-danger"
            >
              <Trash2 aria-hidden className="size-3.5" /> Remove
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
