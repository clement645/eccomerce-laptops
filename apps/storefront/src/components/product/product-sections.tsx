import { BadgeCheck, MessageSquareText, RotateCcw, ShieldCheck, Star, Truck } from 'lucide-react';
import type { ProductDetail } from '@repo/shared-types';
import { formatDate, formatKes } from '@/lib/format';

export function SpecificationsTable({
  specifications,
}: {
  specifications: ProductDetail['specifications'];
}) {
  if (specifications.length === 0)
    return <p className="text-sm text-ink-muted">Specifications coming soon.</p>;
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Technical specifications</caption>
        {specifications.map((group) => (
          <tbody key={group.group}>
            <tr className="bg-surface-muted">
              <th
                colSpan={2}
                scope="colgroup"
                className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-primary-700"
              >
                {group.group}
              </th>
            </tr>
            {group.items.map((item) => (
              <tr key={item.key} className="border-t border-line">
                <th scope="row" className="w-2/5 px-4 py-3 font-medium text-ink-muted">
                  {item.key}
                </th>
                <td className="px-4 py-3 text-ink">{item.value}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

export function DeliveryAndWarranty({ product }: { product: ProductDetail }) {
  const delivery = product.delivery;
  const items = [
    delivery && {
      icon: Truck,
      title: 'Delivery across Kenya',
      text: [
        `Delivery to ${delivery.countiesServed} counties from ${formatKes(delivery.fromPriceMinor)}, within ${Math.max(1, delivery.fastestDays)}–${delivery.slowestDays} working days.`,
        delivery.fastestDays === 0 ? 'Same-day delivery is available in selected areas.' : null,
        delivery.freeAboveMinor
          ? `Free standard delivery on qualifying orders over ${formatKes(delivery.freeAboveMinor)}.`
          : null,
        'The exact cost is shown at checkout.',
      ]
        .filter(Boolean)
        .join(' '),
    },
    {
      icon: ShieldCheck,
      title: product.warranty.months > 0 ? `${product.warranty.months}-month warranty` : 'Warranty',
      text: product.warranty.text ?? 'Warranty details are provided with your invoice.',
    },
    {
      icon: product.condition === 'REFURBISHED' ? RotateCcw : BadgeCheck,
      title:
        product.condition === 'REFURBISHED'
          ? 'Professionally refurbished'
          : 'Brand new and genuine',
      text:
        product.condition === 'REFURBISHED'
          ? 'Inspected, tested and cleaned. Minor cosmetic signs of previous use are possible.'
          : 'Sealed, original product sourced through authorised channels.',
    },
  ].filter((item): item is { icon: typeof Truck; title: string; text: string } => Boolean(item));

  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {items.map(({ icon: Icon, title, text }) => (
        <li key={title} className="rounded-2xl border border-line bg-white p-5">
          <span className="grid size-10 place-items-center rounded-xl bg-primary-50 text-primary-600">
            <Icon aria-hidden className="size-5" />
          </span>
          <h3 className="mt-3 font-bold text-ink">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-ink-muted">{text}</p>
        </li>
      ))}
    </ul>
  );
}

function Stars({ value, className = 'size-4' }: { value: number; className?: string }) {
  return (
    <span className="flex" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${className} ${i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-line text-line'}`}
        />
      ))}
    </span>
  );
}

export function ReviewsSection({ reviews }: { reviews: ProductDetail['reviews'] }) {
  if (!reviews) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-10 text-center">
        <MessageSquareText aria-hidden className="size-8 text-primary-400" />
        <p className="mt-3 font-semibold text-ink">No reviews yet</p>
        <p className="mt-1 max-w-sm text-sm text-ink-muted">
          Reviews come from verified buyers. Once you&apos;ve received your order, you can share
          your experience.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-8 md:grid-cols-[240px_1fr]">
      <div>
        <p className="font-display text-5xl font-extrabold text-ink">
          {reviews.average.toFixed(1)}
        </p>
        <Stars value={reviews.average} className="size-5" />
        <p className="mt-1 text-sm text-ink-muted">
          {reviews.count} {reviews.count === 1 ? 'review' : 'reviews'}
        </p>
        <ul className="mt-4 space-y-1.5" aria-label="Rating distribution">
          {[5, 4, 3, 2, 1].map((stars) => {
            const count = reviews.distribution[stars - 1] ?? 0;
            return (
              <li key={stars} className="flex items-center gap-2 text-xs text-ink-muted">
                <span className="w-10">{stars} star</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                  <span
                    className="block h-full rounded-full bg-amber-400"
                    style={{ width: `${(count / reviews.count) * 100}%` }}
                  />
                </span>
                <span className="w-6 text-right">{count}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <ul className="space-y-4">
        {reviews.items.map((review) => (
          <li key={review.id} className="rounded-2xl border border-line p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Stars value={review.rating} />
              <span className="sr-only">{review.rating} out of 5 stars</span>
              {review.title && <p className="font-semibold text-ink">{review.title}</p>}
            </div>
            <p className="mt-2 text-sm leading-6 text-ink">{review.body}</p>
            <p className="mt-3 text-xs text-ink-subtle">
              {review.authorName}
              {review.verifiedPurchase && (
                <span className="ml-2 font-semibold text-success">Verified purchase</span>
              )}
              <span className="ml-2">{formatDate(review.createdAt)}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
