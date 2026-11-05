import Link from 'next/link';
import { Heart } from 'lucide-react';
import { AddToCartButton } from '@/components/cart/add-to-cart-button';
import type { ProductCard as ProductCardData } from '@repo/shared-types';
import { cn } from '@/lib/cn';
import { formatKes } from '@/lib/format';
import { routes } from '@/lib/routes';
import { ProductVisual } from './product-visual';
import { Rating } from './rating';

interface Badge {
  label: string;
  className: string;
}

function badgesFor(product: ProductCardData): Badge[] {
  const badges: Badge[] = [];
  if (product.stockStatus === 'OUT_OF_STOCK')
    badges.push({ label: 'Out of stock', className: 'bg-ink/80 text-white' });
  if (product.discountPercent > 0)
    badges.push({ label: `-${product.discountPercent}%`, className: 'bg-primary-600 text-white' });
  if (product.isNew) badges.push({ label: 'New', className: 'bg-emerald-700 text-white' });
  if (product.condition === 'REFURBISHED')
    badges.push({ label: 'Refurbished', className: 'bg-amber-700 text-white' });
  return badges.slice(0, 2);
}

export function ProductCard({
  product,
  priority,
}: {
  product: ProductCardData;
  priority?: boolean;
}) {
  const href = routes.product(product.slug);
  const outOfStock = product.stockStatus === 'OUT_OF_STOCK';

  return (
    <article className="group relative flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-white p-3 shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-card-hover">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-surface-sunken">
        <ProductVisual
          product={product}
          sizes="(min-width: 1280px) 280px, (min-width: 768px) 30vw, 50vw"
          priority={priority}
        />
        <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
          {badgesFor(product).map((badge) => (
            <span
              key={badge.label}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-bold leading-none',
                badge.className,
              )}
            >
              {badge.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-1 pb-1 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
          {product.brand.name}
        </p>
        <h3 className="mt-1 line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-ink">
          {/* The stretched link makes the whole card clickable without nesting buttons in links. */}
          <Link
            href={href}
            className="after:absolute after:inset-0 after:rounded-[var(--radius-card)] focus-visible:outline-none"
          >
            {product.name}
          </Link>
        </h3>
        <div className="mt-1.5">
          <Rating rating={product.rating} />
        </div>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
          <p className="text-base font-extrabold text-primary-600">
            {product.hasPriceRange && (
              <span className="mr-1 text-xs font-semibold text-ink-muted">From</span>
            )}
            {formatKes(product.priceMinor)}
          </p>
          {product.compareAtPriceMinor && (
            <p className="text-xs text-ink-subtle line-through">
              <span className="sr-only">Was </span>
              {formatKes(product.compareAtPriceMinor)}
            </p>
          )}
        </div>
        {product.stockStatus === 'LOW_STOCK' && (
          <p className="mt-1 text-xs font-medium text-warning">Only a few left</p>
        )}

        <div className="relative z-10 mt-auto flex items-center gap-2 pt-3">
          <AddToCartButton
            variantId={product.defaultVariantId}
            productName={product.name}
            outOfStock={outOfStock}
          />
          <button
            type="button"
            disabled
            title="Wishlist opens soon"
            aria-label={`Add ${product.name} to wishlist`}
            className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-ink-muted transition enabled:hover:border-primary-200 enabled:hover:text-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Heart aria-hidden className="size-4" />
          </button>
        </div>
      </div>
    </article>
  );
}
