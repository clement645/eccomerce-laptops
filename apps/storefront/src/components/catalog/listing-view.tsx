import Link from 'next/link';
import { SearchX } from 'lucide-react';
import type { ProductListResponse } from '@repo/shared-types';
import { PRODUCT_SORTS } from '@repo/validation';
import { ProductCard } from '@/components/product/product-card';
import { HighlightedText } from '@/components/ui/section-heading';
import { listingHref, type FixedScope, type ListingQuery } from '@/lib/listing-query';
import { routes } from '@/lib/routes';
import { ActiveFilters, type ActiveFilter } from './active-filters';
import { Breadcrumbs, type Crumb } from './breadcrumbs';
import { FiltersForm, type FilterState } from './filters-form';
import { MobileFilters } from './mobile-filters';
import { Pagination } from './pagination';
import { SortSelect } from './sort-select';

export interface ListingViewProps {
  basePath: string;
  fixed: FixedScope;
  query: ListingQuery;
  data: ProductListResponse;
  title: string;
  highlight?: string | null;
  description?: string | null;
  breadcrumbs: Crumb[];
}

function activeFilters(props: ListingViewProps): ActiveFilter[] {
  const { query, fixed, data, basePath } = props;
  const href = (overrides: Parameters<typeof listingHref>[3]) =>
    listingHref(basePath, query, fixed, overrides);
  const label = (list: { value: string; label: string }[], value: string) =>
    list.find((o) => o.value === value)?.label ?? value;
  const filters: ActiveFilter[] = [];

  if (query.category && !fixed.category) {
    filters.push({
      label: label(data.facets.categories, query.category),
      removeHref: href({ category: undefined }),
    });
  }
  for (const brand of query.brand.filter((b) => b !== fixed.brand)) {
    filters.push({
      label: label(data.facets.brands, brand),
      removeHref: href({ brand: query.brand.filter((b) => b !== brand) }),
    });
  }
  for (const condition of query.condition) {
    filters.push({
      label: condition === 'NEW' ? 'New' : 'Refurbished',
      removeHref: href({ condition: query.condition.filter((c) => c !== condition) }),
    });
  }
  for (const spec of query.spec) {
    filters.push({
      label: spec.replace(':', ': '),
      removeHref: href({ spec: query.spec.filter((s) => s !== spec) }),
    });
  }
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    const range = [query.minPrice, query.maxPrice].map((v) =>
      v === undefined ? '' : v.toLocaleString('en-KE'),
    );
    filters.push({
      label: `KES ${range[0] || '0'} – ${range[1] || 'any'}`,
      removeHref: href({ minPrice: undefined, maxPrice: undefined }),
    });
  }
  if (query.inStock) filters.push({ label: 'In stock', removeHref: href({ inStock: undefined }) });
  if (query.onSale && !fixed.onSale)
    filters.push({ label: 'On sale', removeHref: href({ onSale: undefined }) });
  if (query.featured)
    filters.push({ label: 'Featured', removeHref: href({ featured: undefined }) });
  return filters;
}

export function ListingView(props: ListingViewProps) {
  const { basePath, fixed, query, data, title, highlight, description, breadcrumbs } = props;
  const filterState: FilterState = {
    q: query.q,
    // Only carry the sort through filter changes when it differs from the default.
    sort: query.sort !== (query.q ? 'relevance' : 'newest') ? query.sort : undefined,
    category: fixed.category ? undefined : query.category,
    brand: query.brand.filter((b) => b !== fixed.brand),
    condition: query.condition,
    spec: query.spec,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    inStock: query.inStock,
    onSale: fixed.onSale ? false : query.onSale,
  };
  const hide = {
    category: Boolean(fixed.category),
    brand: Boolean(fixed.brand),
    onSale: Boolean(fixed.onSale),
  };
  const filters = activeFilters(props);
  const clearHref = listingHref(basePath, query, fixed, {
    category: undefined,
    brand: [],
    condition: [],
    spec: [],
    minPrice: undefined,
    maxPrice: undefined,
    inStock: undefined,
    onSale: undefined,
    featured: undefined,
  });
  const sortOptions = PRODUCT_SORTS.filter((s) => s !== 'relevance' || query.q).map((value) => ({
    value,
    href: listingHref(basePath, query, fixed, { sort: value }),
  }));
  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.page * data.pageSize, data.total);

  return (
    <>
      <section className="border-b border-line bg-surface-muted">
        <div className="container-page py-8 md:py-10">
          <Breadcrumbs items={breadcrumbs} />
          <h1 className="mt-3 text-3xl font-extrabold md:text-4xl">
            <HighlightedText text={title} highlight={highlight} />
          </h1>
          {description && <p className="mt-2 max-w-2xl text-ink-muted">{description}</p>}
        </div>
      </section>

      <div className="container-page grid gap-8 py-8 lg:grid-cols-[260px_1fr]">
        <aside aria-label="Filters" className="hidden lg:block">
          <div className="sticky top-32 max-h-[calc(100dvh-9rem)] overflow-y-auto rounded-2xl border border-line bg-white px-5 py-2 shadow-card">
            <FiltersForm
              idPrefix="desktop-filters"
              basePath={basePath}
              facets={data.facets}
              state={filterState}
              hide={hide}
            />
          </div>
        </aside>

        <div className="min-w-0">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-muted" role="status">
              {data.total === 0 ? (
                'No products found'
              ) : data.items.length === 0 ? (
                `Page ${data.page} is past the last page`
              ) : (
                <>
                  Showing{' '}
                  <span className="font-semibold text-ink">
                    {from}–{to}
                  </span>{' '}
                  of <span className="font-semibold text-ink">{data.total}</span>{' '}
                  {data.total === 1 ? 'product' : 'products'}
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              <MobileFilters
                basePath={basePath}
                facets={data.facets}
                state={filterState}
                activeCount={filters.length}
                hide={hide}
              />
              <SortSelect value={query.sort} options={sortOptions} />
            </div>
          </div>

          <ActiveFilters filters={filters} clearHref={clearHref} />

          {data.items.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:gap-5">
              {data.items.map((product, index) => (
                <li key={product.id}>
                  <ProductCard product={product} priority={index < 3} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-16 text-center">
              <SearchX aria-hidden className="size-10 text-primary-400" />
              <h2 className="mt-4 text-xl font-bold">
                {data.total > 0 ? 'No products on this page' : 'No products match'}
              </h2>
              <p className="mt-2 max-w-sm text-sm text-ink-muted">
                {data.total > 0
                  ? `There are only ${data.totalPages} ${data.totalPages === 1 ? 'page' : 'pages'} of results.`
                  : query.q
                    ? `We couldn't find anything for “${query.q}”. Check the spelling or try a broader term.`
                    : 'Try removing a filter or two.'}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {data.total > 0 && (
                  <Link
                    href={listingHref(basePath, query, fixed, { page: 1 })}
                    className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white"
                  >
                    Go to the first page
                  </Link>
                )}
                {data.total === 0 && filters.length > 0 && (
                  <Link
                    href={clearHref}
                    className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white"
                  >
                    Clear filters
                  </Link>
                )}
                <Link
                  href={routes.shop}
                  className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:border-primary-200"
                >
                  Browse all products
                </Link>
              </div>
            </div>
          )}

          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            hrefFor={(page) => listingHref(basePath, query, fixed, { page })}
          />
        </div>
      </div>
    </>
  );
}

export function ListingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading products">
      <div className="border-b border-line bg-surface-muted">
        <div className="container-page space-y-3 py-10">
          <div className="h-4 w-40 animate-pulse rounded bg-line" />
          <div className="h-9 w-72 animate-pulse rounded-xl bg-line" />
        </div>
      </div>
      <div className="container-page grid gap-8 py-8 lg:grid-cols-[260px_1fr]">
        <div className="hidden h-96 animate-pulse rounded-2xl bg-surface-sunken lg:block" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="aspect-[4/5] animate-pulse rounded-[var(--radius-card)] bg-surface-sunken"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
