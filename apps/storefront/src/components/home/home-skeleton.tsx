/** Static placeholder shown while homepage content streams in. */
export function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="bg-hero">
        <div className="container-page grid gap-8 pb-28 pt-14 md:grid-cols-2">
          <div className="space-y-5">
            <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
            <div className="h-14 w-full max-w-md animate-pulse rounded-xl bg-white/10" />
            <div className="h-14 w-3/4 animate-pulse rounded-xl bg-white/10" />
            <div className="h-20 w-full max-w-sm animate-pulse rounded-xl bg-white/5" />
            <div className="h-12 w-40 animate-pulse rounded-full bg-white/10" />
          </div>
          <div className="hidden aspect-[4/3] animate-pulse rounded-3xl bg-white/5 md:block" />
        </div>
      </div>
      <div className="container-page -mt-12">
        <div className="h-36 animate-pulse rounded-3xl border border-line bg-white shadow-card" />
      </div>
      <div className="container-page grid grid-cols-2 gap-4 py-20 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="aspect-[4/5] animate-pulse rounded-[var(--radius-card)] bg-surface-sunken"
          />
        ))}
      </div>
    </div>
  );
}
