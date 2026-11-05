import { Star } from 'lucide-react';

/** Shows real review data only. Products without approved reviews say so instead of showing stars. */
export function Rating({ rating }: { rating: { average: number; count: number } | null }) {
  if (!rating) return <p className="text-xs text-ink-subtle">No reviews yet</p>;
  const rounded = Math.round(rating.average * 2) / 2;
  return (
    <p className="flex items-center gap-1.5 text-xs text-ink-muted">
      <span className="flex" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`size-3.5 ${i <= rounded ? 'fill-amber-400 text-amber-400' : i - 0.5 === rounded ? 'fill-amber-400/50 text-amber-400' : 'fill-line text-line'}`}
          />
        ))}
      </span>
      <span className="sr-only">Rated {rating.average.toFixed(1)} out of 5,</span>
      <span>({rating.count})</span>
      <span className="sr-only">reviews</span>
    </p>
  );
}
