import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { CategorySummary } from '@repo/shared-types';
import { DeviceArt } from '@/components/illustrations/device-art';
import { SectionHeading } from '@/components/ui/section-heading';
import { routes } from '@/lib/routes';

const PASTELS = [
  'bg-pastel-blue',
  'bg-pastel-violet',
  'bg-pastel-mint',
  'bg-pastel-pink',
  'bg-pastel-peach',
  'bg-pastel-cyan',
  'bg-pastel-lemon',
  'bg-pastel-slate',
];

export function CategoryGrid({ categories }: { categories: CategorySummary[] }) {
  if (categories.length === 0) return null;
  return (
    <section aria-labelledby="categories-title" className="container-page py-14 md:py-20">
      <SectionHeading
        id="categories-title"
        title="Shop by Category"
        highlight="Category"
        subtitle="Find what you need, all in one place."
        action={{ label: 'View All', href: routes.shop }}
      />
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5">
        {categories.map((category, index) => (
          <li key={category.slug}>
            <Link
              href={routes.category(category.slug)}
              className={`group flex h-full flex-col rounded-[var(--radius-card)] p-4 transition duration-300 hover:-translate-y-1 hover:shadow-card-hover md:p-5 ${PASTELS[index % PASTELS.length]}`}
            >
              <div className="relative aspect-[4/3]">
                {category.imageUrl ? (
                  <Image
                    src={category.imageUrl}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 25vw, 50vw"
                    className="object-contain transition duration-300 group-hover:scale-105"
                  />
                ) : (
                  <DeviceArt
                    kind={category.slug}
                    idPrefix={`cat-${category.slug}`}
                    accent={index}
                    className="h-full w-full transition duration-300 group-hover:scale-105"
                  />
                )}
              </div>
              <h3 className="mt-3 font-display text-base font-bold text-ink">{category.name}</h3>
              <p className="text-xs text-ink-muted">
                {category.productCount} {category.productCount === 1 ? 'product' : 'products'}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary-600">
                Explore Now
                <ArrowRight
                  aria-hidden
                  className="size-3.5 transition group-hover:translate-x-0.5"
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
