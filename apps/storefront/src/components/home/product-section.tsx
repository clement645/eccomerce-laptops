import type { HomepageSection } from '@repo/shared-types';
import { ProductCard } from '@/components/product/product-card';
import { SectionHeading } from '@/components/ui/section-heading';
import { cn } from '@/lib/cn';

const VISIBLE_PRODUCTS = 4;

/** "Best Selling Products" style section: the last word of the title is highlighted. */
export function ProductSection({
  section,
  tinted,
}: {
  section: HomepageSection;
  tinted?: boolean;
}) {
  const lastWord = section.title.trim().split(/\s+/).pop() ?? null;
  const titleId = `section-${section.key}`;
  return (
    <section
      aria-labelledby={titleId}
      className={cn('py-12 md:py-16', tinted && 'bg-surface-muted')}
    >
      <div className="container-page">
        <SectionHeading
          id={titleId}
          title={section.title}
          highlight={lastWord}
          subtitle={section.subtitle}
          action={section.href ? { label: 'View All', href: section.href } : null}
        />
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
          {section.products.slice(0, VISIBLE_PRODUCTS).map((product) => (
            <li key={product.id}>
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
