import type { StoreStats } from '@repo/shared-types';
import { HeroLaptop } from '@/components/illustrations/scenes';

/** Real figures from the database, replacing the reference design's placeholder customer counts. */
export function StatsBanner({ stats }: { stats: StoreStats }) {
  const items = [
    { value: String(stats.productCount), label: 'Products in store' },
    { value: String(stats.brandCount), label: 'Trusted brands' },
    { value: String(stats.countiesServed), label: 'Counties we deliver to' },
    ...(stats.reviews
      ? [
          {
            value: `${stats.reviews.average.toFixed(1)}★`,
            label: `From ${stats.reviews.count} reviews`,
          },
        ]
      : []),
  ].filter((item) => item.value !== '0');

  return (
    <section aria-labelledby="stats-title" className="container-page py-6">
      <div className="bg-brand-gradient relative grid items-center gap-6 overflow-hidden rounded-[2rem] px-6 py-8 text-white md:grid-cols-[auto_1fr_auto] md:px-10">
        <div
          aria-hidden
          className="absolute -right-10 -top-24 size-72 rounded-full bg-white/10 blur-2xl"
        />
        <HeroLaptop idPrefix="stats" className="hidden w-44 md:block" />
        <div className="relative">
          <h2 id="stats-title" className="text-2xl font-extrabold md:text-3xl">
            Shop with confidence
          </h2>
          <p className="mt-1 max-w-md text-sm text-white/80">
            Genuine products, secure M-Pesa checkout and delivery across Kenya.
          </p>
        </div>
        <dl className="relative grid grid-cols-3 gap-4 md:flex md:gap-8">
          {items.map((item) => (
            <div key={item.label} className="text-center md:text-left">
              <dt className="sr-only">{item.label}</dt>
              <dd className="font-display text-3xl font-extrabold">{item.value}</dd>
              <dd aria-hidden className="text-xs text-white/80">
                {item.label}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
